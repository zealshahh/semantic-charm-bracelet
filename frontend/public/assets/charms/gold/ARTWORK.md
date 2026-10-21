# Gold charm artwork

Twenty-four transparent 256 × 256 PNGs, generated with the built-in imagegen
tool and extracted without changing their artwork or alpha. File names match
the existing catalog IDs. The original SVG catalog remains available.

Art direction: macro jewelry product photography; dimensional 18-karat gold,
polished beveled edges, rich enamel insets, consistent lighting and upright
jump rings. Six columns by four rows: heart, moon, food, wave, cloud, mountain;
gift, flower, sun, star, leaf, camera; smile, cake, coffee, book, note, plane;
paw, bike, candle, home, snow, matcha.

Final imagegen edit prompt:

> Remove the entire brown/gold background from this jewelry sprite atlas.
> Output PNG with actual transparent alpha background, not any solid color or
> checkerboard. Preserve exactly all 24 individual charms and their jump rings,
> same precise 6 by 4 grid, same positions, same scale, same details. Remove
> background visible inside the open jump rings, bicycle wheels, musical note,
> and all other holes. No drop shadows or halos. Do not change the charms.
> Image should be a cutout sprite sheet ready for compositing.

`frontend/scripts/split_charm_atlas.py` extracts the 24 assets from the atlas
using only the Python standard library.
