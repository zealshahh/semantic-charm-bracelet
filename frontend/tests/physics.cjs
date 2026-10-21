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
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename)
  return mod.exports
}

const { createChain } = loadPhysics('createChain')
const { assignCharmSlots } = loadPhysics('assignCharmSlots')
const { createCharmItem, stepCharm } = loadPhysics('attachCharm')

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
