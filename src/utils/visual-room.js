/*
RoomVisual v2.0.0 - official Screeps single-file build.
Source: https://github.com/screepers/RoomVisual/releases/download/v2.0.0/RoomVisual.js
Commit: 874f8b9beac09e215a9d8939857471282018a4b0
Original asset SHA256: 1599a777355065d9c1077dc14a1ba0254fe095c4807f6486ed69d9e789f14e6a
Local changes: this provenance and license banner only.

MIT License

Copyright (c) 2017-2026 alinanova21

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region src/geometry.ts
/** Translate every point of `poly` by (x, y). Does not mutate the input. */
function relPoly(x, y, poly) {
	return poly.map(([px, py]) => [px + x, py + y]);
}
/** Repeat the first point at the end so the polygon is closed. */
function closed(poly) {
	const first = poly[0];
	return first ? [...poly, first] : poly;
}
function rotate(x, y, s, c, px, py) {
	return [px + (x * c - y * s), py + (x * s + y * c)];
}
//#endregion
//#region src/animatedPosition.ts
/** Animates a marker at `x`, `y`. Uses `Game.time` as the clock. */
function animatedPosition(visual, x, y, opts = {}) {
	const color = opts.color || "blue";
	const opacity = opts.opacity || .5;
	const frames = opts.frames || 6;
	let radius = opts.radius || .75;
	const angle = Game.time % frames * 90 / frames * (Math.PI / 180);
	const s = Math.sin(angle);
	const c = Math.cos(angle);
	const sizeMod = Math.abs(Game.time % frames - frames / 2) / 10;
	radius += radius * sizeMod;
	const points = [
		rotate(0, -radius, s, c, x, y),
		rotate(radius, 0, s, c, x, y),
		rotate(0, radius, s, c, x, y),
		rotate(-radius, 0, s, c, x, y),
		rotate(0, -radius, s, c, x, y)
	];
	visual.poly(points, {
		stroke: color,
		opacity
	});
	return visual;
}
//#endregion
//#region src/colors.ts
const COLOR_SETS = {
	white: ["#ffffff", "#4c4c4c"],
	grey: ["#b4b4b4", "#4c4c4c"],
	red: ["#ff7b7b", "#592121"],
	yellow: ["#fdd388", "#5d4c2e"],
	green: ["#00f4a2", "#236144"],
	blue: ["#50d7f9", "#006181"],
	purple: ["#a071ff", "#371383"]
};
const COLORS = {
	gray: "#555555",
	light: "#AAAAAA",
	road: "#666",
	energy: "#FFE87B",
	power: "#F53547",
	dark: "#181818",
	outline: "#8FBB93",
	speechText: "#000000",
	speechBackground: "#2ccf3b"
};
//#endregion
//#region src/resource.ts
let colorsCache;
function resourceColors() {
	colorsCache ??= {
		[RESOURCE_ENERGY]: COLOR_SETS.yellow,
		[RESOURCE_POWER]: COLOR_SETS.red,
		[RESOURCE_HYDROGEN]: COLOR_SETS.grey,
		[RESOURCE_OXYGEN]: COLOR_SETS.grey,
		[RESOURCE_UTRIUM]: COLOR_SETS.blue,
		[RESOURCE_LEMERGIUM]: COLOR_SETS.green,
		[RESOURCE_KEANIUM]: COLOR_SETS.purple,
		[RESOURCE_ZYNTHIUM]: COLOR_SETS.yellow,
		[RESOURCE_CATALYST]: COLOR_SETS.red,
		[RESOURCE_GHODIUM]: COLOR_SETS.white,
		[RESOURCE_HYDROXIDE]: COLOR_SETS.grey,
		[RESOURCE_ZYNTHIUM_KEANITE]: COLOR_SETS.grey,
		[RESOURCE_UTRIUM_LEMERGITE]: COLOR_SETS.grey,
		[RESOURCE_UTRIUM_HYDRIDE]: COLOR_SETS.blue,
		[RESOURCE_UTRIUM_OXIDE]: COLOR_SETS.blue,
		[RESOURCE_KEANIUM_HYDRIDE]: COLOR_SETS.purple,
		[RESOURCE_KEANIUM_OXIDE]: COLOR_SETS.purple,
		[RESOURCE_LEMERGIUM_HYDRIDE]: COLOR_SETS.green,
		[RESOURCE_LEMERGIUM_OXIDE]: COLOR_SETS.green,
		[RESOURCE_ZYNTHIUM_HYDRIDE]: COLOR_SETS.yellow,
		[RESOURCE_ZYNTHIUM_OXIDE]: COLOR_SETS.yellow,
		[RESOURCE_GHODIUM_HYDRIDE]: COLOR_SETS.white,
		[RESOURCE_GHODIUM_OXIDE]: COLOR_SETS.white,
		[RESOURCE_UTRIUM_ACID]: COLOR_SETS.blue,
		[RESOURCE_UTRIUM_ALKALIDE]: COLOR_SETS.blue,
		[RESOURCE_KEANIUM_ACID]: COLOR_SETS.purple,
		[RESOURCE_KEANIUM_ALKALIDE]: COLOR_SETS.purple,
		[RESOURCE_LEMERGIUM_ACID]: COLOR_SETS.green,
		[RESOURCE_LEMERGIUM_ALKALIDE]: COLOR_SETS.green,
		[RESOURCE_ZYNTHIUM_ACID]: COLOR_SETS.yellow,
		[RESOURCE_ZYNTHIUM_ALKALIDE]: COLOR_SETS.yellow,
		[RESOURCE_GHODIUM_ACID]: COLOR_SETS.white,
		[RESOURCE_GHODIUM_ALKALIDE]: COLOR_SETS.white,
		[RESOURCE_CATALYZED_UTRIUM_ACID]: COLOR_SETS.blue,
		[RESOURCE_CATALYZED_UTRIUM_ALKALIDE]: COLOR_SETS.blue,
		[RESOURCE_CATALYZED_KEANIUM_ACID]: COLOR_SETS.purple,
		[RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: COLOR_SETS.purple,
		[RESOURCE_CATALYZED_LEMERGIUM_ACID]: COLOR_SETS.green,
		[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]: COLOR_SETS.green,
		[RESOURCE_CATALYZED_ZYNTHIUM_ACID]: COLOR_SETS.yellow,
		[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: COLOR_SETS.yellow,
		[RESOURCE_CATALYZED_GHODIUM_ACID]: COLOR_SETS.white,
		[RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: COLOR_SETS.white
	};
	return colorsCache;
}
function isMineral(type) {
	return type === RESOURCE_CATALYST || type === RESOURCE_HYDROGEN || type === RESOURCE_OXYGEN || type === RESOURCE_LEMERGIUM || type === RESOURCE_UTRIUM || type === RESOURCE_ZYNTHIUM || type === RESOURCE_KEANIUM;
}
const SYMBOL_DEFS = [
	[
		"RESOURCE_SYMBOL_ALEPH",
		"𐤀",
		"#C63946"
	],
	[
		"RESOURCE_SYMBOL_BETH",
		"𐤁",
		"#B72E6F"
	],
	[
		"RESOURCE_SYMBOL_GIMMEL",
		"𐤂",
		"#B72FA5"
	],
	[
		"RESOURCE_SYMBOL_DALETH",
		"𐤃",
		"#A334B7"
	],
	[
		"RESOURCE_SYMBOL_HE",
		"𐤄",
		"#9D41ED"
	],
	[
		"RESOURCE_SYMBOL_WAW",
		"𐤅",
		"#8441ED"
	],
	[
		"RESOURCE_SYMBOL_ZAYIN",
		"𐤆",
		"#6E49FF"
	],
	[
		"RESOURCE_SYMBOL_HETH",
		"𐤇",
		"#4E71FF"
	],
	[
		"RESOURCE_SYMBOL_TETH",
		"𐤈",
		"#5088F4"
	],
	[
		"RESOURCE_SYMBOL_YODH",
		"𐤉",
		"#3DA1EA"
	],
	[
		"RESOURCE_SYMBOL_KAPH",
		"𐤊",
		"#38A9C7"
	],
	[
		"RESOURCE_SYMBOL_LAMEDH",
		"𐤋",
		"#35B7B5"
	],
	[
		"RESOURCE_SYMBOL_MEM",
		"𐤌",
		"#36B79A"
	],
	[
		"RESOURCE_SYMBOL_NUN",
		"𐤍",
		"#33B75D"
	],
	[
		"RESOURCE_SYMBOL_SAMEKH",
		"𐤎",
		"#3FB147"
	],
	[
		"RESOURCE_SYMBOL_AYIN",
		"𐤏",
		"#69A239"
	],
	[
		"RESOURCE_SYMBOL_PE",
		"𐤐",
		"#7EA232"
	],
	[
		"RESOURCE_SYMBOL_TSADE",
		"𐤑",
		"#9FA23B"
	],
	[
		"RESOURCE_SYMBOL_QOPH",
		"𐤒",
		"#BB933A"
	],
	[
		"RESOURCE_SYMBOL_RES",
		"𐤓",
		"#D88942"
	],
	[
		"RESOURCE_SYMBOL_SIN",
		"𐤔",
		"#DC763D"
	],
	[
		"RESOURCE_SYMBOL_TAW",
		"𐤕",
		"#D64B3D"
	]
];
let symbolsCache;
function symbols() {
	if (!symbolsCache) {
		const g = globalThis;
		symbolsCache = /* @__PURE__ */ new Map();
		for (const [name, glyph, color] of SYMBOL_DEFS) {
			const value = g[name];
			if (value) symbolsCache.set(value, {
				glyph,
				color
			});
		}
	}
	return symbolsCache;
}
const SYMBOL_OUTLINE = /*#__PURE__*/ [
	[64, 128],
	[24.45, 121.78],
	[6.31, 86.07],
	[0, 46.52],
	[28.35, 18.23],
	[64, 0],
	[99.65, 18.23],
	[128, 46.52],
	[121.69, 86.07],
	[103.55, 121.78],
	[64, 128]
].map(([px, py]) => [(px - 64) / 128, (py - 64) / 128]);
function fluid(visual, type, x, y, size) {
	const [fill, text] = resourceColors()[type] ?? COLOR_SETS.grey;
	visual.circle(x, y, {
		radius: size,
		fill,
		opacity: 1
	});
	visual.text(type[0] ?? "", x, y - size * .1, {
		font: size * 1.5,
		color: text,
		backgroundColor: fill,
		backgroundPadding: 0
	});
}
function mineral(visual, type, x, y, size) {
	const [fill, text] = resourceColors()[type] ?? COLOR_SETS.grey;
	visual.circle(x, y, {
		radius: size,
		fill,
		opacity: 1
	});
	visual.circle(x, y, {
		radius: size * .8,
		fill: text,
		opacity: 1
	});
	visual.text(type, x, y + size * .03, {
		font: `bold ${size * 1.25} arial`,
		color: fill,
		backgroundColor: text,
		backgroundPadding: 0
	});
}
function compound(visual, type, x, y, size) {
	const [fill, text] = resourceColors()[type] ?? COLOR_SETS.grey;
	visual.text(type.replace("2", "₂"), x, y, {
		font: `bold ${size} arial`,
		color: text,
		backgroundColor: fill,
		backgroundPadding: .3 * size
	});
}
/** Default `size` (badge radius, in grid units). */
const DEFAULT_SIZE = .25;
/** Symbols default to a full tile (radius 0.5), as they always have. */
const DEFAULT_SYMBOL_SIZE = .5;
function symbol(visual, type, x, y, size) {
	const s = symbols().get(type);
	if (!s) return;
	const scale = size * 2;
	const outline = SYMBOL_OUTLINE.map(([px, py]) => [px * scale, py * scale]);
	visual.poly(relPoly(x, y, outline), {
		opacity: 1,
		fill: s.color,
		stroke: "transparent"
	});
	visual.text(s.glyph, x, y + size * .175, {
		font: `bold ${size * .4} arial`,
		color: "black"
	});
}
/**
* Draws a resource badge. Returns `OK` (0), or `ERR_INVALID_ARGS` (-10) for unknown resources.
*/
function resource(visual, type, x, y, size) {
	const res = type;
	const r = size ?? DEFAULT_SIZE;
	if (res === RESOURCE_ENERGY || res === RESOURCE_POWER) fluid(visual, res, x, y, r);
	else if (isMineral(res)) mineral(visual, res, x, y, r);
	else if (resourceColors()[res] !== void 0) compound(visual, res, x, y, r);
	else if (symbols().has(type)) symbol(visual, type, x, y, size ?? DEFAULT_SYMBOL_SIZE);
	else return ERR_INVALID_ARGS;
	return OK;
}
//#endregion
//#region src/structure.ts
function factoryLevelGaps() {
	let x = -.08;
	let y = -.52;
	const result = [];
	const gapAngle = 16 * (Math.PI / 180);
	const c1 = Math.cos(gapAngle);
	const s1 = Math.sin(gapAngle);
	const angle = 72 * (Math.PI / 180);
	const c2 = Math.cos(angle);
	const s2 = Math.sin(angle);
	for (let i = 0; i < 5; ++i) {
		result.push([0, 0]);
		result.push([x, y]);
		result.push([x * c1 - y * s1, x * s1 + y * c1]);
		const tmpX = x * c2 - y * s2;
		y = x * s2 + y * c2;
		x = tmpX;
	}
	return result;
}
const FACTORY_OUTLINE = [
	[-.68, -.11],
	[-.84, -.18],
	[-.84, -.32],
	[-.44, -.44],
	[-.32, -.84],
	[-.18, -.84],
	[-.11, -.68],
	[.11, -.68],
	[.18, -.84],
	[.32, -.84],
	[.44, -.44],
	[.84, -.32],
	[.84, -.18],
	[.68, -.11],
	[.68, .11],
	[.84, .18],
	[.84, .32],
	[.44, .44],
	[.32, .84],
	[.18, .84],
	[.11, .68],
	[-.11, .68],
	[-.18, .84],
	[-.32, .84],
	[-.44, .44],
	[-.84, .32],
	[-.84, .18],
	[-.68, .11]
];
const FACTORY_SPIKES = [
	[-.4, -.1],
	[-.8, -.2],
	[-.8, -.3],
	[-.4, -.4],
	[-.3, -.8],
	[-.2, -.8],
	[-.1, -.4],
	[.1, -.4],
	[.2, -.8],
	[.3, -.8],
	[.4, -.4],
	[.8, -.3],
	[.8, -.2],
	[.4, -.1],
	[.4, .1],
	[.8, .2],
	[.8, .3],
	[.4, .4],
	[.3, .8],
	[.2, .8],
	[.1, .4],
	[-.1, .4],
	[-.2, .8],
	[-.3, .8],
	[-.4, .4],
	[-.8, .3],
	[-.8, .2],
	[-.4, .1]
];
const FACTORY_LEVEL_GAPS = /*#__PURE__*/ factoryLevelGaps();
const LINK_OUTER = [
	[0, -.5],
	[.4, 0],
	[0, .5],
	[-.4, 0]
];
const LINK_INNER = [
	[0, -.3],
	[.25, 0],
	[0, .3],
	[-.25, 0]
];
const TERMINAL_OUTER = [
	[0, -.8],
	[.55, -.55],
	[.8, 0],
	[.55, .55],
	[0, .8],
	[-.55, .55],
	[-.8, 0],
	[-.55, -.55]
];
const TERMINAL_INNER = [
	[0, -.65],
	[.45, -.45],
	[.65, 0],
	[.45, .45],
	[0, .65],
	[-.45, .45],
	[-.65, 0],
	[-.45, -.45]
];
const LAB_BOX = [
	[-.45, .3],
	[-.45, .55],
	[.45, .55],
	[.45, .3]
];
const STORAGE_OUTLINE = [
	[-.45, -.55],
	[0, -.65],
	[.45, -.55],
	[.55, 0],
	[.45, .55],
	[0, .65],
	[-.45, .55],
	[-.55, 0],
	[-.45, -.55]
];
const NUKER_OUTLINE = [
	[0, -1],
	[-.47, .2],
	[-.5, .5],
	[.5, .5],
	[.47, .2],
	[0, -1]
];
const NUKER_INLINE = [
	[0, -.8],
	[-.4, .2],
	[.4, .2],
	[0, -.8]
];
/** Road positions per visual, consumed by `connectRoads`. */
const roadsByVisual = /* @__PURE__ */ new WeakMap();
/** Draws `type` at `x`, `y`. Returns `visual` for chaining. */
function structure(visual, x, y, type, opts = {}) {
	const opacity = opts.opacity ?? 1;
	switch (type) {
		case STRUCTURE_FACTORY:
			visual.poly(relPoly(x, y, FACTORY_OUTLINE), {
				fill: null,
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			visual.circle(x, y, {
				radius: .65,
				fill: "#232323",
				strokeWidth: .035,
				stroke: "#140a0a",
				opacity
			});
			visual.poly(relPoly(x, y, FACTORY_SPIKES), {
				fill: COLORS.gray,
				stroke: "#140a0a",
				strokeWidth: .04,
				opacity
			});
			visual.circle(x, y, {
				radius: .54,
				fill: "#302a2a",
				strokeWidth: .04,
				stroke: "#140a0a",
				opacity
			});
			visual.poly(relPoly(x, y, FACTORY_LEVEL_GAPS), {
				fill: "#140a0a",
				stroke: null,
				opacity
			});
			visual.circle(x, y, {
				radius: .42,
				fill: "#140a0a",
				opacity
			});
			visual.rect(x - .24, y - .24, .48, .48, {
				fill: "#3f3f3f",
				opacity
			});
			break;
		case STRUCTURE_EXTENSION:
			visual.circle(x, y, {
				radius: .5,
				fill: COLORS.dark,
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			visual.circle(x, y, {
				radius: .35,
				fill: COLORS.gray,
				opacity
			});
			break;
		case STRUCTURE_SPAWN:
			visual.circle(x, y, {
				radius: .65,
				fill: COLORS.dark,
				stroke: "#CCCCCC",
				strokeWidth: .1,
				opacity
			});
			visual.circle(x, y, {
				radius: .4,
				fill: COLORS.energy,
				opacity
			});
			break;
		case STRUCTURE_POWER_SPAWN:
			visual.circle(x, y, {
				radius: .65,
				fill: COLORS.dark,
				stroke: COLORS.power,
				strokeWidth: .1,
				opacity
			});
			visual.circle(x, y, {
				radius: .4,
				fill: COLORS.energy,
				opacity
			});
			break;
		case STRUCTURE_LINK:
			visual.poly(closed(relPoly(x, y, LINK_OUTER)), {
				fill: COLORS.dark,
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			visual.poly(closed(relPoly(x, y, LINK_INNER)), {
				fill: COLORS.gray,
				stroke: false,
				opacity
			});
			break;
		case STRUCTURE_TERMINAL:
			visual.poly(closed(relPoly(x, y, TERMINAL_OUTER)), {
				fill: COLORS.dark,
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			visual.poly(closed(relPoly(x, y, TERMINAL_INNER)), {
				fill: COLORS.light,
				stroke: false,
				opacity
			});
			visual.rect(x - .45, y - .45, .9, .9, {
				fill: COLORS.gray,
				stroke: COLORS.dark,
				strokeWidth: .1,
				opacity
			});
			break;
		case STRUCTURE_LAB:
			visual.circle(x, y - .025, {
				radius: .55,
				fill: COLORS.dark,
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			visual.circle(x, y - .025, {
				radius: .4,
				fill: COLORS.gray,
				opacity
			});
			visual.rect(x - .45, y + .3, .9, .25, {
				fill: COLORS.dark,
				stroke: false,
				opacity
			});
			visual.poly(relPoly(x, y, LAB_BOX), {
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			break;
		case STRUCTURE_TOWER:
			visual.circle(x, y, {
				radius: .6,
				fill: COLORS.dark,
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			visual.rect(x - .4, y - .3, .8, .6, {
				fill: COLORS.gray,
				opacity
			});
			visual.rect(x - .2, y - .9, .4, .5, {
				fill: COLORS.light,
				stroke: COLORS.dark,
				strokeWidth: .07,
				opacity
			});
			break;
		case STRUCTURE_ROAD: {
			visual.circle(x, y, {
				radius: .175,
				fill: COLORS.road,
				stroke: false,
				opacity
			});
			let roads = roadsByVisual.get(visual);
			if (!roads) {
				roads = [];
				roadsByVisual.set(visual, roads);
			}
			roads.push([x, y]);
			break;
		}
		case STRUCTURE_RAMPART:
			visual.circle(x, y, {
				radius: .65,
				fill: "#434C43",
				stroke: "#5D735F",
				strokeWidth: .1,
				opacity
			});
			break;
		case STRUCTURE_WALL:
			visual.circle(x, y, {
				radius: .4,
				fill: COLORS.dark,
				stroke: COLORS.light,
				strokeWidth: .05,
				opacity
			});
			break;
		case STRUCTURE_STORAGE:
			visual.poly(relPoly(x, y, STORAGE_OUTLINE), {
				stroke: COLORS.outline,
				strokeWidth: .05,
				fill: COLORS.dark,
				opacity
			});
			visual.rect(x - .35, y - .45, .7, .9, {
				fill: COLORS.energy,
				opacity
			});
			break;
		case STRUCTURE_OBSERVER:
			visual.circle(x, y, {
				fill: COLORS.dark,
				radius: .45,
				stroke: COLORS.outline,
				strokeWidth: .05,
				opacity
			});
			visual.circle(x + .225, y, {
				fill: COLORS.outline,
				radius: .2,
				opacity
			});
			break;
		case STRUCTURE_NUKER:
			visual.poly(relPoly(x, y, NUKER_OUTLINE), {
				stroke: COLORS.outline,
				strokeWidth: .05,
				fill: COLORS.dark,
				opacity
			});
			visual.poly(relPoly(x, y, NUKER_INLINE), {
				stroke: COLORS.outline,
				strokeWidth: .01,
				fill: COLORS.gray,
				opacity
			});
			break;
		case STRUCTURE_CONTAINER:
			visual.rect(x - .225, y - .3, .45, .6, {
				fill: COLORS.gray,
				opacity,
				stroke: COLORS.dark,
				strokeWidth: .09
			});
			visual.rect(x - .17, y + .07, .34, .2, {
				fill: COLORS.energy,
				opacity
			});
			break;
		default: visual.circle(x, y, {
			fill: COLORS.light,
			radius: .35,
			stroke: COLORS.dark,
			strokeWidth: .2,
			opacity
		});
	}
	return visual;
}
//#endregion
//#region src/roads.ts
/** Half of the 8 neighbours is enough: every pair is visited from one side. */
const ROAD_DIRS = [
	[0, -1],
	[1, -1],
	[1, 0],
	[1, 1]
];
/** Connects roads drawn with `structure(..., 'road')` the way the game does. */
function connectRoads(visual, opts = {}) {
	const roads = roadsByVisual.get(visual);
	if (!roads) return visual;
	const color = opts.color || COLORS.road || "white";
	for (const [rx, ry] of roads) for (const [dx, dy] of ROAD_DIRS) {
		const cx = rx + dx;
		const cy = ry + dy;
		if (roads.some(([ox, oy]) => ox === cx && oy === cy)) visual.line(rx, ry, cx, cy, {
			color,
			width: .35,
			opacity: opts.opacity || 1
		});
	}
	return visual;
}
//#endregion
//#region src/demo.ts
/**
* Clears the visual and draws a sample of everything near (19, 24), for a quick visual preview:
* structures, connected roads, resource badges and (on servers that have them) symbol badges.
*/
function demo(visual) {
	const x = 19;
	visual.clear();
	const row = (y, types) => {
		types.forEach((type, i) => {
			structure(visual, x + i, y, type);
		});
	};
	row(24, [
		STRUCTURE_LAB,
		STRUCTURE_TOWER,
		STRUCTURE_LINK,
		STRUCTURE_TERMINAL,
		STRUCTURE_EXTENSION,
		STRUCTURE_SPAWN
	]);
	row(27, [
		STRUCTURE_POWER_SPAWN,
		STRUCTURE_STORAGE,
		STRUCTURE_OBSERVER,
		STRUCTURE_NUKER,
		STRUCTURE_FACTORY,
		STRUCTURE_CONTAINER
	]);
	row(30, [
		STRUCTURE_RAMPART,
		STRUCTURE_WALL,
		STRUCTURE_ROAD,
		STRUCTURE_ROAD,
		STRUCTURE_ROAD
	]);
	structure(visual, 22, 31, STRUCTURE_ROAD);
	connectRoads(visual);
	[
		RESOURCE_ENERGY,
		RESOURCE_POWER,
		RESOURCE_HYDROGEN,
		RESOURCE_CATALYST,
		RESOURCE_HYDROXIDE,
		RESOURCE_UTRIUM_ACID,
		RESOURCE_CATALYZED_GHODIUM_ALKALIDE
	].forEach((type, i) => {
		resource(visual, type, x + i, 34);
	});
	(globalThis.SYMBOLS ?? []).forEach((type, i) => {
		resource(visual, type, x + i % 11, 36 + Math.floor(i / 11) * 2);
	});
	return visual;
}
//#endregion
//#region src/speech.ts
const SPEECH_SIZE = .5;
const SPEECH_FONT = "Times New Roman";
/** Simulates `creep.say()` through room visuals. */
function speech(visual, text, x, y, opts = {}) {
	const background = opts.background || COLORS.speechBackground;
	const textcolor = opts.textcolor || COLORS.speechText;
	const textstyle = opts.textstyle || false;
	const textsize = opts.textsize || SPEECH_SIZE;
	const textfont = opts.textfont || SPEECH_FONT;
	const opacity = opts.opacity || 1;
	const font = `${textstyle ? `${textstyle} ` : ""}${textsize} ${textfont}`;
	const pointer = closed(relPoly(x, y, [
		[-.2, -.8],
		[.2, -.8],
		[0, -.3]
	]));
	visual.poly(pointer, {
		fill: background,
		stroke: background,
		opacity,
		strokeWidth: 0
	});
	visual.text(text, x, y - 1, {
		color: textcolor,
		backgroundColor: background,
		backgroundPadding: .1,
		opacity,
		font
	});
	return visual;
}
//#endregion
//#region src/install.ts
/**
* Adds `structure`, `connectRoads`, `speech`, `animatedPosition`, `resource` and `test` to
* `RoomVisual.prototype`. Pass a different prototype to install elsewhere (e.g. in tests).
*/
function install(proto = RoomVisual.prototype) {
	proto.structure = function(x, y, type, opts) {
		return structure(this, x, y, type, opts);
	};
	proto.connectRoads = function(opts) {
		return connectRoads(this, opts);
	};
	proto.speech = function(text, x, y, opts) {
		return speech(this, text, x, y, opts);
	};
	proto.animatedPosition = function(x, y, opts) {
		return animatedPosition(this, x, y, opts);
	};
	proto.test = function() {
		return demo(this);
	};
	proto.resource = function(type, x, y, size) {
		return resource(this, type, x, y, size);
	};
}
//#endregion
//#region src/register.ts
install();
//#endregion
exports.install = install;
