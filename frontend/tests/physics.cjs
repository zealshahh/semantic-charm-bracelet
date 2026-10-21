const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const test = require('node:test')
const ts = require('typescript')
const Matter = require('matter-js')

// Run the actual TypeScript physics modules without a browser or bundler.
function loadPhysics(name) {
  const filename = path.resolve(__dirname, `../src/physics/${name}.ts`)
  if (require.cache[filename]) return require.cache[filename].exports
  const mod = new Module(filename, module)
  mod.paths = module.paths
  require.cache[filename] = mod
  mod.require = (id) => id.startsWith('./') ? loadPhysics(id.slice(2)) : require(id)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename)
  return mod.exports
}

const { createChain } = loadPhysics('createChain')
const { assignCharmSlots } = loadPhysics('assignCharmSlots')
const { createCharmItem, stepCharm } = loadPhysics('attachCharm')
const { startCharmDrag, finishCharmDrag, nearestCharmLink } = loadPhysics('attachCharm')
const { addCharms } = loadPhysics('addCharms')

test('adding a charm preserves existing bodies, momentum, chain constraints and an active grip', () => {
  const engine = Matter.Engine.create()
  const chain = createChain(engine.world, 942, 424)
  const collection = { world: engine.world, links: chain.links, items: [], size: 88, initialized: false }
  const charm = id => ({ id, physics: { density: .001, friction: .3, restitution: .2 } })
  const initial = [charm('heart'), charm('book'), charm('cloud')], slots = new Map()
  assert.equal(addCharms(collection, initial, new Map(), slots, 0), 3)
  collection.items.forEach(item => stepCharm(item, 5000, engine.world, 88, true))
  Matter.Body.setVelocity(collection.items[0].body, { x: 2, y: -1 })
  startCharmDrag(collection.items[1], engine.world)
  const snapshot = collection.items.map(item => ({ item, body: item.body, link: item.link, grip: item.grip,
    attachment: item.attachment, position: { ...item.body.position }, velocity: { ...item.body.velocity } }))
  const constraints = Matter.Composite.allConstraints(engine.world).slice()
  const desired = [...initial, charm('butterfly')]
  assert.equal(addCharms(collection, desired, new Map(), slots, 60000), 1)
  for (const [i, before] of snapshot.entries()) {
    const item = collection.items[i]
    assert.equal(item, before.item)
    assert.equal(item.body, before.body)
    assert.equal(item.link, before.link)
    assert.equal(item.grip, before.grip)
    assert.equal(item.attachment, before.attachment)
    assert.deepEqual(item.body.position, before.position)
    assert.deepEqual(item.body.velocity, before.velocity)
  }
  assert.deepEqual(Matter.Composite.allConstraints(engine.world), constraints)
  assert.equal(Matter.Composite.allBodies(engine.world).length, chain.links.length + 4)
  assert.equal(new Set(collection.items.map(item => item.link)).size, 4)
  const added = collection.items[3]
  stepCharm(added, 60100, engine.world, 88, false)
  assert.equal(added.state, 'wait', 'late additions use the running clock for their drop delay')
  stepCharm(added, 60200, engine.world, 88, true)
  assert.equal(added.state, 'on')
  assert.equal(addCharms(collection, desired, new Map(), slots, 60300), 0, 'repeated updates cannot duplicate bodies')
})

test('rebuilding after a resize restores saved slots while subsequent additions remain incremental', () => {
  const engine = Matter.Engine.create(), chain = createChain(engine.world, 340, 424)
  const collection = { world: engine.world, links: chain.links, items: [], size: 44, initialized: false }
  const charms = ['heart', 'book'].map(id => ({ id, physics: { density: .001, friction: .3, restitution: .2 } }))
  const slots = new Map([['heart', 19], ['book', 8]])
  addCharms(collection, charms, new Map(), slots, 0)
  assert.equal(collection.items[0].link, chain.links[19])
  assert.equal(collection.items[1].link, chain.links[8])
  assert.ok(collection.items.every(item => item.state === 'on'))
  assert.equal(Matter.Composite.allConstraints(engine.world).length, 28)
})

test('a held charm follows a physical grip, tilts, and reattaches without teleporting', () => {
  const engine = Matter.Engine.create({ positionIterations: 10, constraintIterations: 6 })
  const chain = createChain(engine.world, 942, 424), size = 88
  const item = createCharmItem({ physics: { density: .001, friction: .3, restitution: .2 } }, null, chain.links[8], size, 0, false)
  Matter.Composite.add(engine.world, item.body)
  stepCharm(item, 0, engine.world, size, true)
  startCharmDrag(item, engine.world, { x: item.body.position.x + 15, y: item.body.position.y - 20 })
  const before = { ...item.body.position }
  item.grip.pointA = { x: before.x + 140, y: before.y - 70 }
  assert.deepEqual(item.body.position, before, 'moving the hand does not teleport the body')
  for (let i = 0; i < 120; i++) Matter.Engine.update(engine, 1000 / 60)
  assert.ok(item.body.position.x > before.x + 100)
  assert.ok(Math.abs(item.body.angle) > .05, 'the charm pivots around the actual grip')
  const released = { ...item.body.position }
  finishCharmDrag(item, chain.links[18], [item], engine.world, size)
  assert.deepEqual(item.body.position, released, 'release begins from the held position')
  assert.equal(item.grip, null)
  for (let i = 0; i < 600; i++) {
    stepCharm(item, i * 1000 / 60, engine.world, size, false)
    Matter.Engine.update(engine, 1000 / 60)
  }
  assert.equal(item.state, 'on')
  assert.ok(Number.isFinite(item.body.position.y))
  assert.equal(Matter.Composite.allConstraints(engine.world).length, 27)
})

test('repeated moves and swaps keep unique slots and stable attachments', () => {
  const engine = Matter.Engine.create({ positionIterations: 10, constraintIterations: 6 })
  const chain = createChain(engine.world, 942, 424), size = 88
  const items = [4, 13, 22].map((slot, i) => createCharmItem(
    { physics: { density: 0.001, friction: 0.3, restitution: 0.2 } }, null, chain.links[slot], size, i, false))
  Matter.Composite.add(engine.world, items.map(item => item.body))
  items.forEach(item => stepCharm(item, 0, engine.world, size, true))
  const count = Matter.Composite.allConstraints(engine.world).length
  for (const slot of [8, 13, 22, 8, 20, 4]) {
    const moving = items[0], original = moving.link
    const occupant = items.find(item => item !== moving && item.link === chain.links[slot])
    startCharmDrag(moving, engine.world)
    assert.equal(Matter.Composite.allConstraints(engine.world).length, count)
    assert.equal(moving.body.isStatic, false, "the held charm keeps its weight and inertia")
    stepCharm(moving, 5000, engine.world, size, true)
    assert.equal(moving.state, 'drag')
    finishCharmDrag(moving, chain.links[slot], items, engine.world, size)
    assert.equal(moving.link, chain.links[slot])
    if (occupant) assert.equal(occupant.link, original)
    assert.equal(new Set(items.map(item => item.link)).size, items.length)
    assert.equal(moving.state, 'settle')
    for (let tick = 0; tick < 240; tick++) {
      items.forEach(item => stepCharm(item, 6000 + tick * 1000 / 60, engine.world, size, false))
      Matter.Engine.update(engine, 1000 / 60)
    }
    assert.equal(Matter.Composite.allConstraints(engine.world).length, count)
    for (const item of items) {
      assert.equal(item.attachment.bodyA, item.link)
      assert.equal(item.body.isStatic, false)
      assert.ok(Number.isFinite(item.body.position.x) && Number.isFinite(item.body.position.y))
      assert.ok(Number.isFinite(item.body.mass))
    }
  }
  assert.equal(nearestCharmLink(chain.links, chain.links[0].position), chain.links[2])
  startCharmDrag(items[0], engine.world)
  const original = items[0].link
  finishCharmDrag(items[0], original, items, engine.world, size)
  assert.equal(items[0].link, original)
  stepCharm(items[0], 10000, engine.world, size, true)
  assert.equal(Matter.Composite.allConstraints(engine.world).length, count)
})

for (const [width, count, animate, reduced] of [
  [942, 4, true, false], [340, 7, true, false], [942, 5, false, false], [340, 3, true, true],
]) {
  test(`charms attach and stay visible: width=${width}, count=${count}, animate=${animate}, reduced=${reduced}`, () => {
    const engine = Matter.Engine.create({ positionIterations: 10, constraintIterations: 6 })
    const height = 424
    const chain = createChain(engine.world, width, height)
    const size = Math.max(44, Math.min(88, width * 0.095))
    const slots = assignCharmSlots(count, chain.linkCount)
    const charm = { physics: { density: 0.001, friction: 0.3, restitution: 0.2 } }
    const items = slots.map((slot, i) => createCharmItem(charm, null, chain.links[slot], size, i, animate))
    Matter.Composite.add(engine.world, items.map(item => item.body))
    for (let tick = 0; tick < 1200; tick++) {
      for (const item of items) stepCharm(item, tick * 1000 / 60, engine.world, size, reduced)
      Matter.Engine.update(engine, 1000 / 60)
      for (const body of Matter.Composite.allBodies(engine.world)) {
        assert.ok(Number.isFinite(body.position.x) && Number.isFinite(body.position.y), 'simulation must stay finite')
      }
    }
    for (const item of items) {
      assert.equal(item.state, 'on')
      assert.ok(Number.isFinite(item.body.mass) && item.body.mass > 0)
      assert.ok(item.body.position.x > 0 && item.body.position.x < width)
      assert.ok(item.body.position.y > 0 && item.body.position.y < height - size / 2)
    }
  })
}
