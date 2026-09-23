// Original layered SVG artwork. Every coat uses the same expressive face rig.
import { LITTER_CAPACITY } from "./care-constants.js";

export const VERSION = "2.0";
export const CATS = Object.freeze([
    { id: "ginger", label: "Ginger tabby" },
    { id: "brown-tabby", label: "Brown tabby" },
    { id: "tuxedo", label: "Tuxedo" },
    { id: "black", label: "Black" },
    { id: "gray", label: "Gray" },
    { id: "calico", label: "Calico" },
].map(Object.freeze));
export const MODES = Object.freeze([
    { id: "asleep", label: "Asleep" },
    { id: "sleepy", label: "Sleepy" },
    { id: "content", label: "Content" },
    { id: "happy", label: "Loved" },
    { id: "waiting", label: "Attention, please" },
    { id: "grumpy", label: "Grumpy" },
    { id: "zoomies", label: "Zoomies" },
    { id: "settling", label: "Catching breath" },
    { id: "annoyed", label: "Nap interrupted" },
    { id: "playfight", label: "Play fighting" },
    { id: "eating", label: "Treat time" },
    { id: "guarding", label: "My treat" },
    { id: "grooming", label: "Cleaning up" },
    { id: "bowl-eating", label: "Dinner time" },
    { id: "full", label: "Very full" },
    { id: "puking", label: "Too many treats" },
    { id: "hungry", label: "Feed me, please" },
    { id: "litter", label: "A private moment" },
    { id: "dirty-litter", label: "Clean my litter" },
    { id: "love", label: "Super love" },
    { id: "biscuits", label: "Making biscuits" },
    { id: "watching", label: "Investigating nothing" },
    { id: "stretching", label: "A good stretch" },
    { id: "stalking", label: "On the prowl" },
    { id: "greeting", label: "Saying hello" },
    { id: "grooming-together", label: "Helping with the ears" },
    { id: "resting-together", label: "Quiet company" },
    { id: "warning", label: "Getting worked up" },
    { id: "enough", label: "Enough, human" },
    { id: "overstimulated", label: "Too much" },
    { id: "attack", label: "Attack" },
    { id: "angry", label: "Still mad" },
    { id: "recovering", label: "A little space" },
    { id: "playing-together", label: "Playing together" },
    { id: "squabbling", label: "A little squabble" },
    { id: "jealous", label: "Where is my Churu?" },
    { id: "social-grumpy", label: "Not speaking to you" },
    { id: "mischief", label: "Up to something" },
    { id: "mischief-sulk", label: "You spoiled it" },
    { id: "disappointed", label: "Foiled again" },
    { id: "food-sulk", label: "No place at dinner" },
    { id: "saved", label: "Saved it!" },
    { id: "innocent", label: "Who, me?" },
    { id: "outside", label: "Out wandering" },
    { id: "door-out", label: "Let me out" },
    { id: "door-in", label: "Let me in" },
].map(Object.freeze));

const BG = "#101111";
const CREAM = "#F5EDDE";
const GINGER = "#E5AD68";
const PINK = "#CE8B85";
const TAU = Math.PI * 2;
const COATS = Object.freeze({
    ginger: { fill: GINGER, stripe: "#92613B", ear: "#92613B", muzzle: CREAM, ink: BG, paw: GINGER, outline: BG },
    "brown-tabby": { fill: "#AA9275", stripe: "#514A3E", ear: "#746151", muzzle: "#DFD1B9", ink: BG, paw: "#AA9275", outline: BG },
    tuxedo: { fill: BG, ear: CREAM, muzzle: CREAM, ink: CREAM, paw: CREAM, outline: CREAM },
    black: { fill: "#292C2B", ear: "#726B68", muzzle: "#292C2B", ink: CREAM, paw: "#292C2B", outline: "#ACB0A4" },
    gray: { fill: "#969EA3", ear: "#60696D", muzzle: "#C6CBCA", ink: BG, paw: "#969EA3", outline: BG },
    calico: { fill: CREAM, ear: "#BA8870", muzzle: CREAM, ink: BG, paw: CREAM, outline: BG },
});
const xml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const path = (d, color = BG, width = 3.6) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ellipse = (x, y, rx, ry, fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const heart = (x, y, size, opacity = 1) => `<path d="M0 3C0-1 5-2 7 2C9-2 14-1 14 3C14 7 7 12 7 12C7 12 0 7 0 3Z" fill="${PINK}" transform="translate(${x} ${y}) scale(${size / 14})" opacity="${opacity}"/>`;
const clamp = value => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : 0;
const fixed = value => value.toFixed(2);

// Ear tips move with the outer silhouette, inner ears and coat patches together.
function earPose(mode, phase, overloadWarning, recovery, micro) {
    if (micro?.kind === "ear" && ["asleep", "sleepy", "content", "waiting", "settling"].includes(mode)) return [micro.amount * .13, 0];
    if (mode === "playing-together") return [.08, .12 + Math.sin(phase * TAU) * .06];
    if (mode === "squabbling") return [.65, .7];
    if (mode === "jealous") return [.25, .55];
    if (mode === "social-grumpy") return [.62, .72];
    if (mode === "puking") return [.42, .42];
    if (mode === "litter") return [.12, .12];
    if (mode === "dirty-litter") return [.48, .65];
    if (mode === "hungry") return [.08, .18];
    if (mode === "attack") return [1.08, 1.08];
    if (mode === "angry") return [.85, .94];
    if (mode === "overstimulated" || overloadWarning) return [1, 1];
    if (["enough", "annoyed"].includes(mode)) return [.65, .9];
    if (mode === "recovering") return [.6 * (1 - recovery) + .05, .6 * (1 - recovery) + .05];
    if (mode === "warning") return [.12, .42 + Math.sin(phase * TAU) * .15];
    if (mode === "grumpy") return [.3, .3];
    if (mode === "guarding") return [.25, .5];
    return [0, 0];
}

function coat(cat, mode, phase, overloadWarning, recovery, micro) {
    const c = COATS[cat];
    const [left, right] = earPose(mode, phase, overloadWarning, recovery, micro);
    const lx = 28 - left * 14, ly = 18 + left * 26;
    const rx = 116 + right * 14, ry = 18 + right * 26;
    const head = `M29 56Q24 46 ${lx} ${ly}Q${lx + 2} ${ly - 6} ${lx + 7} ${ly - 1}L55 35Q72 29 89 35L${rx - 7} ${ry - 1}Q${rx - 1} ${ry - 6} ${rx} ${ry + 1}Q121 46 115 57L123 70L116 72L124 86L115 86Q116 111 92 122Q73 131 52 122Q28 113 28 88L20 89L27 75L20 72Z`;
    let markings = "";
    if (c.stripe) {
        markings = `<path d="M59 35L62 51L67 54L68 34L72 45L77 34L78 53L83 50L87 35ZM29 56L43 62L45 68L28 65ZM116 56L102 62L100 68L117 65ZM27 78L43 82L45 88L27 86ZM117 78L102 82L100 88L117 86Z" fill="${c.stripe}"/>`;
    } else if (cat === "calico") {
        markings = `<path d="M${lx} ${ly}L55 33Q70 30 71 48Q68 65 50 68L26 59Z" fill="${GINGER}"/><path d="M89 33L${rx} ${ry}L124 72L115 90Q94 96 81 82Q77 69 83 54Z" fill="#292C2B"/>`;
    }
    const muzzle = cat === "tuxedo"
        ? `<path d="M72 56C67 72 64 84 52 88Q37 87 35 103Q44 124 72 125Q101 124 110 103Q106 86 93 88C81 82 79 69 72 56Z" fill="${CREAM}"/>`
        : cat === "black" ? "" : `<path d="M45 91Q57 86 72 93Q87 86 101 91Q110 101 100 111Q72 128 45 111Q35 101 45 91Z" fill="${c.muzzle}"/>`;
    const inner = `<path d="M${lx + 6} ${ly + 7}L48 41L34 49ZM${rx - 6} ${ry + 7}L97 41L110 49Z" fill="${c.ear}"/>`;
    const clipId = `coat-${cat}-${mode}-${fixed(left).replace(".", "-")}-${fixed(right).replace(".", "-")}`;
    return `<g data-layer="coat"><defs><clipPath id="${clipId}"><path d="${head}"/></clipPath></defs><path d="${head}" fill="${c.fill}"/><g data-layer="coat-mask" clip-path="url(#${clipId})">${markings}${inner}${muzzle}</g><path d="${head}" fill="none" stroke="${c.outline}" stroke-width="${cat === "tuxedo" ? 3.8 : 2.4}" stroke-linejoin="round"/></g>`;
}

function eyes(cat, mode, phase, variant, gesture, overloadWarning, recovery, treatStyle, micro) {
    const c = COATS[cat];
    const wave = Math.sin(phase * TAU);
    const round = (x, y, rx, ry, pupil = 4.4, dx = 0) => ellipse(x, y, rx, ry, CREAM)
        + ellipse(x + dx, y, pupil, Math.max(pupil, ry * .72), BG);
    const each = draw => draw(51, cat === "calico" ? BG : c.ink, false) + draw(93, cat === "calico" ? CREAM : c.ink, true);
    if (mode === "playing-together") return `<g data-expression="friendly-play">${round(51, 73, 11, 13, 6.5, 2)}${each((x, ink, right) => right ? path(`M${x - 9} 76Q${x} 61 ${x + 9} 74`, ink, 4.2) : "")}</g>`;
    if (mode === "squabbling") return `<g data-expression="comic-squint">${each((x, ink, right) => path(right ? `M${x + 8} 67L${x - 7} 75L${x + 8} 81` : `M${x - 8} 67L${x + 7} 75L${x - 8} 81`, ink, 4.2))}</g>`;
    if (mode === "jealous") return `<g data-expression="jealous-side-eye">${each((x, ink, right) => path(`M${x - 10} ${right ? 69 : 66}L${x + 10} ${right ? 66 : 69}`, ink, 4) + ellipse(x + 5, 75, 3.1, 5, ink))}</g>`;
    if (mode === "social-grumpy") return `<g data-expression="social-sulk">${each((x, ink) => path(`M${x - 9} 72H${x + 9}`, ink, 4.2) + ellipse(x - 4, 78, 2.8, 3.7, ink))}</g>`;
    if (mode === "puking") return `<g data-expression="squeezed-eyes">${each((x, ink, right) => path(right ? `M${x + 8} 66L${x - 7} 74L${x + 8} 81` : `M${x - 8} 66L${x + 7} 74L${x - 8} 81`, ink, 4.4))}</g>`;
    if (mode === "litter") return `<g data-expression="concentrating">${each((x, ink) => path(`M${x - 10} 71Q${x} 82 ${x + 10} 71`, ink, 4.8))}</g>`;
    if (mode === "dirty-litter") return `<g data-expression="nose-wrinkle">${each((x, ink, right) => path(`M${x - 10} ${right ? 72 : 68}L${x + 9} ${right ? 68 : 73}M${x - 7} 78L${x + 7} 79`, ink, 4))}</g>`;
    if (mode === "hungry") return `<g data-expression="pleading">${round(51, 73, 15, 17, 9.5)}${round(93, 73, 15, 17, 9.5)}${ellipse(47, 67, 4.2, 4.4, CREAM)}${ellipse(89, 67, 4.2, 4.4, CREAM)}${ellipse(55, 80, 2.3, 2.3, CREAM)}${ellipse(97, 80, 2.3, 2.3, CREAM)}${path("M39 51Q48 45 61 52", cat === "calico" ? BG : c.ink, 3.2)}${path("M83 52Q96 45 105 51", cat === "calico" ? CREAM : c.ink, 3.2)}</g>`;
    if (mode === "full") return each((x, ink) => path(`M${x - 10} 73Q${x} 79 ${x + 10} 73`, ink, 4.5));
    if (mode === "bowl-eating") return each((x, ink) => path(`M${x - 9} 73Q${x} 77 ${x + 9} 73`, ink, 4));
    if (mode === "attack") return `<g data-expression="hissing-stare"><path d="M39 64L63 73L60 85Q48 88 41 78ZM81 73L105 64L103 78Q96 88 84 85Z" fill="${CREAM}"/>`
        + ellipse(52, 77, 2.7, 7, BG) + ellipse(92, 77, 2.7, 7, BG)
        + path("M38 62L64 71", cat === "calico" ? BG : c.ink, 4.7)
        + path("M80 71L106 62", cat === "calico" ? CREAM : c.ink, 4.7) + `</g>`;
    if (mode === "angry") return `<g data-expression="sulky-stare"><path d="M40 72L62 77L59 83L43 81ZM82 77L104 72L101 81L85 83Z" fill="${CREAM}"/>`
        + ellipse(54, 79, 2.4, 4.2, BG) + ellipse(96, 79, 2.4, 4.2, BG)
        + path("M39 70L63 75", cat === "calico" ? BG : c.ink, 4.5)
        + path("M81 75L105 70", cat === "calico" ? CREAM : c.ink, 4.5) + `</g>`;
    if (overloadWarning) return each((x, ink) => path(`M${x - 10} 69H${x + 10}`, ink, 4.2) + ellipse(x - 2, 75, 3, 4.5, ink));
    if (mode === "overstimulated") return each((x, ink, right) => path(`M${x - 10} ${right ? 74 : 67}L${x + 10} ${right ? 67 : 74}`, ink, 4.5) + ellipse(x, 79, 4, 5, ink));
    if (["enough", "annoyed"].includes(mode)) return each((x, ink) => path(`M${x - 10} 69H${x + 10}`, ink, 4.6) + ellipse(x - 4, 75, 3, 4, ink));
    if (mode === "recovering") return each((x, ink) => recovery > .6 && phase > .3 && phase < .7
        ? path(`M${x - 7} 74Q${x} 79 ${x + 7} 74`, ink, 3.6)
        : path(`M${x - 9} ${71 - recovery * 3}H${x + 9}`, ink, 3.6) + ellipse(x + wave * 2, 76 - recovery * 3, 3.5, 4.5 + recovery, ink));
    if (mode === "warning") return each((x, ink, right) => path(`M${x - 9} ${right ? 72 : 74}Q${x} ${right ? 69 : 76} ${x + 9} 73`, ink, 3.6) + ellipse(x + 3, 77, 2.5, 3, ink));
    if (mode === "love") {
        if (variant === "sleep") return each((x, ink) => path(`M${x - 10} 73Q${x} 63 ${x + 10} 73`, ink, 4.4));
        return ellipse(51, 73, 14, 15, BG) + ellipse(93, 73, 14, 15, BG) + heart(39, 63, 24) + heart(81, 63, 24);
    }
    if (mode === 'eating' && treatStyle === 'sniff') return each((x, ink) => ellipse(x,75,3.6,5,ink));
    if (mode === "eating") {
        if (gesture === "side-eye" || treatStyle === "protective" || variant === "sleep") return each((x, ink) => path(`M${x - 9} 70H${x + 9}`, ink, 4) + ellipse(x + 4, 75, 3, 4, ink));
        if (variant === "wild" || treatStyle === "tube-grab") return round(51, 74, 12, 13, 7) + round(93, 74, 12, 13, 7);
        return each((x, ink) => path(`M${x - 9} 73Q${x} 64 ${x + 9} 73`, ink, 4.4));
    }
    if (mode === "playfight") return round(51, 74, 12, 14, 7) + path("M84 66L101 74L84 82", cat === "calico" ? CREAM : c.ink, 4.3);
    if (mode === "guarding") return each((x, ink) => path(`M${x - 11} 68L${x + 10} 73`, ink, 4) + ellipse(x + 4, 78, 3.5, 5, ink));
    if (micro && ["content", "waiting", "sleepy", "settling"].includes(mode)) {
        const closed = micro.kind === 'blink' && micro.amount > .35;
        const dx = micro.kind === 'glance' ? micro.direction * micro.amount * 3 : 0;
        return each((x, ink) => closed ? path(`M${x-7} 74Q${x} 79 ${x+7} 74`, ink, 4)
            : ellipse(x+dx, 74, 4, mode === 'sleepy' ? 3.5 : 7, ink));
    }
    if (mode === 'asleep' && micro?.kind === 'peek' && micro.amount > .35) return each((x, ink, right) => right
        ? path(`M${x-8} 73H${x+8}`, ink, 4) + ellipse(x,77,2.8,3,ink) : path(`M${x-9} 75Q${x} 82 ${x+9} 75`, ink, 4.4));
    if (mode === "asleep") return each((x, ink) => path(`M${x - 9} 75Q${x} 82 ${x + 9} 75`, ink, 4.4));
    if (mode === "happy" && (gesture === "sleepy-smile" || variant === "sleep")) return path("M42 75Q51 81 60 75", c.ink, 4)
        + path("M84 73H102", cat === "calico" ? CREAM : c.ink, 4) + ellipse(91, 77, 3, 3, cat === "calico" ? CREAM : c.ink);
    if (mode === "happy" && gesture === "slow-blink") return each((x, ink) => phase > .25 && phase < .8
        ? path(`M${x - 7} 74Q${x} 79 ${x + 7} 74`, ink, 4) : ellipse(x, 73, 4, 6, ink));
    if (["happy", "grooming"].includes(mode)) return each((x, ink) => path(`M${x - 10} 76Q${x} 60 ${x + 10} 76`, ink, 4.4));
    if (mode === "sleepy") return each((x, ink) => path(`M${x - 9} 73H${x + 9}`, ink, 4.4) + ellipse(x, 77, 3.3, 3.8, ink));
    if (mode === "content") {
        const blink = gesture === "slow-blink" ? phase > .25 && phase < .8 : phase > .965;
        return each((x, ink) => blink ? path(`M${x - 6} 74Q${x} 77 ${x + 6} 74`, ink, 4) : ellipse(x, 73, 4.7, 7.5, ink));
    }
    if (mode === "grumpy") return `<path d="M40 67L62 74Q58 86 49 82Q42 80 40 67ZM82 74L104 67Q103 80 95 82Q86 86 82 74Z" fill="${CREAM}"/>`
        + ellipse(53, 76, 3, 5, BG) + ellipse(91, 76, 3, 5, BG)
        + path("M39 65L63 72", c.ink, 4.3) + path("M81 72L105 65", cat === "calico" ? CREAM : c.ink, 4.3);
    if (mode === "zoomies") return round(50, 72, 14, 17, 9.3, wave * 2) + round(94, 71, 14, 18, 9.3, wave * 2)
        + ellipse(48, 66, 2.6, 3, CREAM) + ellipse(92, 65, 2.6, 3, CREAM);
    if (mode === "settling") return each((x, ink) => path(`M${x - 9} 74Q${x} 79 ${x + 9} 74`, ink, 4));
    return round(51, 73, 12.5, 14, 6.3) + round(93, 73, 12.5, 14, 6.3)
        + path("M41 53Q49 48 58 53", c.ink, 3.2) + path("M86 53Q95 48 103 53", cat === "calico" ? CREAM : c.ink, 3.2);
}

function mouth(cat, mode, phase, groomPart = "right-paw") {
    const ink = cat === "black" ? CREAM : BG;
    const nose = ["litter", "dirty-litter"].includes(mode)
        ? `<g data-layer="pinched-nose"><path d="M67 91Q72 89 77 91L75 96H69Z" fill="${PINK}"/>${path("M60 94L65 97M79 97L84 94", ink, 2.7)}</g>`
        : `<path d="M66 91Q72 88 78 91Q78 94 72 98Q66 94 66 91Z" fill="${PINK}"/>`;
    let expression;
    if (mode === "playing-together") expression = `<g data-expression="play-smile">${path("M72 98V102M57 100Q61 116 72 104Q83 116 87 100", ink, 3.5)}</g>`;
    else if (mode === "squabbling") expression = `<g data-expression="comic-yowl"><path d="M61 103Q72 97 83 103L82 114Q72 121 62 114Z" fill="${BG}" stroke="${ink}" stroke-width="2"/><path d="M65 102L68 110L71 101M74 101L77 110L80 102" fill="${CREAM}"/>${ellipse(73, 115, 5, 2.5, PINK)}</g>`;
    else if (mode === "jealous") expression = `<g data-expression="treat-pout">${path("M72 98V102M59 111Q64 105 71 110Q77 105 85 111", ink, 3.6)}</g>`;
    else if (mode === "social-grumpy") expression = path("M72 98V103M59 110H84M59 110L55 108", ink, 3.4);
    else if (mode === "puking") expression = `<g data-expression="retch-mouth">${ellipse(72, 109, 8.5, 10, BG)}${path("M63 106Q61 114 65 117M81 106Q83 114 79 117", ink, 2.2)}${ellipse(72, 115, 5.7, 3, "#D7B280")}</g>`;
    else if (mode === "attack") expression = `<g data-expression="hiss"><path d="M55 104Q72 96 89 104L87 117Q72 126 57 117Z" fill="${BG}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><g data-layer="fangs"><path d="M59 103L64 114L68 100ZM76 100L81 114L86 103Z" fill="${CREAM}"/></g><path d="M63 118Q72 111 81 118Q72 123 63 118Z" fill="${PINK}"/></g>`;
    else if (mode === "angry") expression = path("M72 98V104M58 112Q72 102 86 112M58 112L54 110M86 112L90 110", ink, 3.6);
    else if (["grumpy", "annoyed", "enough", "overstimulated"].includes(mode)) expression = path("M72 98V102M59 110Q72 100 85 110", ink, 3.4);
    else if (["zoomies", "playfight"].includes(mode)) expression = `<path d="M59 101Q72 106 86 100Q85 118 72 119Q60 116 59 101Z" fill="${BG}"/><path d="M70 113Q77 108 82 112Q78 119 72 117Z" fill="${PINK}"/><path d="M62 103L66 110L69 105Z" fill="${CREAM}"/>`;
    else if (mode === "litter") expression = path("M70 99L69 102M74 99L75 102", ink, 2.7) + ellipse(72, 109, 4.2, 5.6, ink);
    else if (mode === "dirty-litter") expression = path("M72 98V102M58 111Q72 101 86 111", ink, 3.8);
    else if (mode === "hungry") expression = `<path d="M64 102Q72 98 80 102Q83 108 77 114Q72 117 67 113Q61 108 64 102Z" fill="${BG}" stroke="${ink}" stroke-width="1.6"/>${ellipse(73, 112, 5, 2.3, PINK)}`;
    else if (mode === "full") expression = path("M62 102Q72 114 83 102", ink, 3.8);
    else if (["eating", "guarding", "grooming", "bowl-eating"].includes(mode)) {
        const lick = Math.max(0, Math.sin(phase * TAU));
        const tongue = `<path d="M74 103Q80 100 84 105L${86 + lick * 4} ${109 + lick * 3}Q85 115 79 110Z" fill="${PINK}" stroke="${BG}" stroke-width="1.7"/>`;
        expression = path("M61 103Q69 109 76 103", ink, 3) + (mode === "grooming" && groomPart === "left-paw" ? `<g transform="translate(144 0) scale(-1 1)">${tongue}</g>` : tongue);
    } else if (mode === "settling") expression = `<path d="M64 102Q72 107 81 102L80 113Q78 120 73 117L70 110Q64 109 64 102Z" fill="${BG}"/><path d="M71 109Q77 111 80 108L79 114Q75 120 72 114Z" fill="${PINK}"/>`;
    else if (["happy", "love"].includes(mode)) expression = path("M72 97V102M58 100Q60 114 72 103Q84 114 86 100", ink, 3.5);
    else expression = path("M72 98V102M60 103Q66 110 72 103Q78 110 84 103", ink, 3.2);
    return `<g data-layer="mouth">${nose}${expression}</g>`;
}

function loveHearts(phase) {
    const lift = Math.sin(phase * Math.PI) * 5;
    return heart(7, 39 - lift, 16) + heart(119, 35 - lift, 17) + heart(13, 111 - lift, 11, .8)
        + heart(121, 110 - lift, 11, .8) + heart(58, 12 - lift / 2, 12, .8) + heart(81, 16 - lift, 9, .65);
}

function cues(mode, phase, affectionate, overloadWarning, treatStyle) {
    if (mode === "playing-together") return `<g data-layer="friendly-motion">${path("M10 71L16 74M9 84H15M128 68L135 64M130 79H138", CREAM, 2.7)}</g>`;
    if (mode === "squabbling") return `<g data-layer="comic-squabble">${path("M7 48L14 53M5 59H13M130 49L137 44M132 59H139M13 104L7 109M130 104L136 110", CREAM, 2.6)}<path d="M10 20L13 26L20 26L15 31L17 37L11 33L6 37L7 30L2 26L9 25Z" fill="${CREAM}"/></g>`;
    if (mode === "jealous") return `<g data-layer="treat-thought">${ellipse(109, 48, 2.1, 2.1, CREAM)}${ellipse(115, 40, 3, 3, CREAM)}<ellipse cx="127" cy="22" rx="14" ry="18" fill="${BG}" stroke="${CREAM}" stroke-width="2"/><g transform="translate(126 21) rotate(18)"><path d="M-5-9H5L6 12H-6Z" fill="${CREAM}"/><path d="M-5-2H5V8H-5Z" fill="${PINK}"/>${ellipse(0, 3, 2.5, 1.8, CREAM)}${path("M-3-10Q-4-15 1-14L3-10", "#D7B280", 2.5)}</g></g>`;
    if (mode === "social-grumpy") return `<g data-layer="sulky-sigh">${path("M126 61H135M126 68Q132 68 132 74", CREAM, 2.4)}</g>`;
    if (mode === "hungry") return `<g data-layer="hunger-cues">${path("M10 31Q16 23 22 31M15 37H19M122 30Q129 23 135 31M127 37H131", CREAM, 2.5)}</g>`;
    if (mode === "dirty-litter") return `<g data-layer="odor-lines">${path("M11 89Q4 82 12 75Q19 68 12 62M133 94Q125 86 133 79Q140 72 133 65", "#A99D84", 2.7)}</g>`;
    if (mode === "full") return `<g data-layer="satisfied-sigh">${path("M124 55Q134 54 132 61M127 67H135", CREAM, 2.5)}</g>`;
    if (mode === "attack") return `<g data-layer="scratch-arcs" transform="translate(${fixed(Math.sin(phase * TAU) * 1.5)} 0)">${path("M8 45Q21 49 34 64M6 60Q18 65 28 78M8 77Q17 81 22 94M136 44Q123 49 112 63M138 59Q127 65 119 78M136 77Q128 82 124 94", CREAM, 2.8)}</g>`;
    if (mode === "angry") return `<g data-expression="held-boundary">${path("M127 46L133 43M128 55H135", CREAM, 2.8)}</g>`;
    if (overloadWarning) return path("M128 44L134 40M129 53H136", PINK, 2.6);
    if (mode === "love" || (mode === "playfight" && affectionate)) return loveHearts(phase);
    if (mode === "eating" && treatStyle === "affectionate") return heart(10, 45 - Math.sin(phase * Math.PI) * 3, 13) + heart(120, 54, 10, .8);
    if (["annoyed", "enough"].includes(mode)) return path("M128 33L133 29M129 44H136", CREAM, 3);
    if (mode === "overstimulated") return path("M9 57L15 60M8 69H14M128 57L134 54M129 68H136", PINK, 3);
    if (mode === "playfight") return path("M8 63L16 68M6 80H14M129 57L136 51M129 76H137", CREAM, 3.2);
    if (mode === "guarding") return path("M124 32V39", PINK, 3.2) + ellipse(124, 44, 1.6, 1.6, PINK);
    if (mode === "asleep") return `<g fill="${CREAM}" opacity="${fixed(.65 + Math.sin(phase * TAU) * .25)}" transform="translate(0 ${fixed(-phase * 3)})"><path d="M117 27H129V30L120 38H130V41H115V38L124 30H117Z"/><path d="M128 12H138V15L132 20H139V23H127V20L134 15H128Z"/></g>`;
    if (mode === "happy") return heart(8, 38 - Math.sin(phase * Math.PI) * 4, 15) + heart(120, 47 - Math.sin(phase * Math.PI) * 7, 12, .82);
    if (mode === "waiting") return `<g transform="translate(0 ${fixed(Math.sin(phase * TAU) * 1.5)})">${path("M127 26V34", CREAM, 3.6)}${ellipse(127, 40, 1.9, 1.9, CREAM)}</g>`;
    if (mode === "grumpy") return path("M124 31V36H129M131 41H126V46", PINK, 3);
    if (mode === "zoomies") return path("M8 52L17 49M5 67H16M8 82L16 86M127 49L136 45M129 65H140M128 81L137 84", CREAM, 3.3);
    if (mode === "settling") return path("M120 95Q132 99 127 104M120 106Q135 111 127 116", CREAM, 2.8);
    return "";
}

function paw(cat, x, y, angle = 0, scale = 1) {
    const c = COATS[cat];
    return `<g data-layer="paw" transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})"><path d="M-14 14L-16-2Q-17-13-11-14Q-9-22-3-18Q2-24 7-18Q14-20 16-12Q22-9 18 1L14 14Z" fill="${c.paw}" stroke="${cat === "black" ? c.outline : BG}" stroke-width="3" stroke-linejoin="round"/>${ellipse(0, 2, 8, 6, PINK)}${ellipse(-10, -8, 3.1, 4, PINK)}${ellipse(-1, -12, 3.1, 4, PINK)}${ellipse(9, -9, 3.1, 4, PINK)}</g>`;
}

function clawPaw(cat, x, y, angle, scale) {
    return `<g data-layer="swiping-paw" transform="translate(${fixed(x)} ${fixed(y)}) rotate(${fixed(angle)}) scale(${fixed(scale)})">${paw(cat, 0, 0)}<g data-layer="claws"><path d="M-13-13L-16-26Q-9-25-8-17ZM-4-17L-2-31Q4-27 3-17ZM8-16L15-27Q18-20 13-12Z" fill="${CREAM}" stroke="${BG}" stroke-width="1.8" stroke-linejoin="round"/></g></g>`;
}

function tail(cat, mode, phase) {
    if (["playing-together", "jealous", "social-grumpy"].includes(mode)) {
        const c = COATS[cat];
        const tip = Math.sin(phase * TAU) * (mode === "playing-together" ? 5 : 2);
        const d = `M36 130Q8 134 9 112Q6 94 ${18 + tip} 88`;
        return `<g data-layer="social-tail">${path(d, c.outline, 11)}${path(d, c.fill, 7)}${c.stripe ? path("M9 118L14 119M10 107L15 110", c.stripe, 3) : ""}</g>`;
    }
    if (!["warning", "enough", "overstimulated", "angry", "recovering", "content", "love"].includes(mode)) return "";
    const c = COATS[cat];
    const flick = Math.sin(phase * TAU * (["warning", "enough", "angry"].includes(mode) ? 2 : 1));
    const tip = mode === "warning" ? flick * 9 : mode === "enough" ? flick * 13 : mode === "angry" ? flick * 8 : flick * 2;
    const d = mode === "angry" ? `M36 130Q8 134 9 111Q6 87 ${18 + tip} 83` : `M36 130Q8 132 9 113Q8 99 ${17 + tip} 96`;
    return `<g data-layer="tail">${path(d, c.outline, 11)}${path(d, c.fill, 7)}${c.stripe ? path(`M9 118L14 119M10 107L15 110`, c.stripe, 3) : ""}</g>`;
}

function accessories(cat, mode, phase, variant, gesture, treatStyle, groomPart = "right-paw", buddyCat = cat, socialRole = "left") {
    const wave = Math.sin(phase * TAU);
    if (["playing-together", "squabbling"].includes(mode)) {
        const mirrored = socialRole === "right" ? ' transform="translate(144 0) scale(-1 1)"' : "";
        const own = mode === "squabbling" ? clawPaw(cat, 37 + Math.max(0, wave) * 12, 122 - Math.max(0, wave) * 13, -15 + wave * 14, .7)
            : paw(cat, 40, 126 - Math.max(0, wave) * 12, -16 + wave * 8, .72);
        const buddy = mode === "squabbling" ? clawPaw(buddyCat, 126 - Math.max(0, -wave) * 13, 117 - Math.max(0, -wave) * 12, -38 + wave * 12, .62)
            : paw(buddyCat, 125 - Math.max(0, -wave) * 9, 118 - Math.max(0, -wave) * 9, -42 + wave * 10, .61);
        return `<g data-layer="social-paws"${mirrored}>${own}<g data-layer="buddy-paw" data-buddy-cat="${buddyCat}">${buddy}</g></g>`;
    }
    if (["jealous", "social-grumpy"].includes(mode)) return `<g data-layer="folded-paws">${paw(cat, 60, 136, -35, .58)}${paw(cat, 85, 134, 28, .6)}</g>`;
    if (mode === "attack") return clawPaw(cat, 32 + Math.max(0, wave) * 17, 112 - Math.max(0, wave) * 20, -24 + wave * 26, 1.02 + Math.max(0, wave) * .09)
        + clawPaw(cat, 112 - Math.max(0, -wave) * 17, 112 - Math.max(0, -wave) * 20, 24 + wave * 26, 1.02 + Math.max(0, -wave) * .09);
    if (mode === "angry") return `<g data-layer="defensive-paws">${paw(cat, 51, 131, -20, .65)}${paw(cat, 97, 123, 22, .78)}</g>`;
    if (mode === "annoyed") return paw(cat, 94, 83 - wave * 1.2, -18, .9);
    if (mode === "enough") return variant === "sleep" ? paw(cat, 94, 84 - wave, -18, .92) : paw(cat, 105, 109 - wave, 12, 1.05);
    if (mode === "overstimulated") return paw(cat, 41 + wave * 3, 108, -8, .95) + paw(cat, 109, 115, 15, .82);
    if (mode === "playfight") {
        const energy = variant === "wild" ? 1.2 : 1;
        return paw(cat, 35, 116 + wave * 8 * energy, -22, 1 + wave * .06) + paw(cat, 109, 116 - wave * 8 * energy, 22, 1 - wave * .06);
    }
    if (["eating", "guarding"].includes(mode)) {
        const holdingTight = mode === "guarding" || ["protective", "tube-grab"].includes(treatStyle);
        const tilt = holdingTight ? -17 + (treatStyle === "tube-grab" ? wave * 5 : 0) : -27 + wave * (variant === "wild" ? 4 : 1.5);
        const tube = `<g data-layer="treat" transform="translate(91 115) rotate(${tilt})"><path d="M-7-4L-9 24L-7 28H7L9 24L7-4Z" fill="${CREAM}" stroke="${BG}" stroke-width="2.5" stroke-linejoin="round"/><path d="M-6 7H7L8 22H-8Z" fill="${PINK}"/><path d="M-6 25H6M-5-4V-8H5V-4" fill="none" stroke="${BG}" stroke-width="2"/>${ellipse(0, 14, 4.8, 3.3, CREAM)}<path d="M3 14L7 10V18Z" fill="${CREAM}"/><path d="M-3-8Q-6-14-2-15Q2-17 4-12L4-8Z" fill="#D7B280"/></g>`;
        return tube + paw(cat, holdingTight ? 76 : 108, 131, holdingTight ? -28 : 25, .63) + (holdingTight ? paw(cat, 107, 121, 23, .7) : "");
    }
    if (mode === "dirty-litter") return `<g data-layer="nose-paw">${paw(cat, 74, 116, -5, .53)}</g>`;
    if (mode === "hungry") return paw(cat, 47, 136, -12, .59) + paw(cat, 98, 136, 12, .59);
    if (mode === "grooming" || gesture === "groom") {
        if (groomPart === "left-paw") return `<g data-groom-part="left-paw">${paw(cat, 52, 112 - Math.max(0, wave) * 9, 30, .68)}</g>`;
        if (groomPart === "tail") {
            const c = COATS[cat];
            const d = `M39 134Q107 147 113 119Q115 101 88 ${104 - Math.max(0, wave) * 4}`;
            return `<g data-groom-part="tail">${path(d, c.outline, 15)}${path(d, c.fill, 10)}${c.stripe ? path("M62 136L64 143M84 134L90 141M106 124L115 127", c.stripe, 4) : ""}${paw(cat, 61, 136, -10, .52)}</g>`;
        }
        return `<g data-groom-part="right-paw">${paw(cat, 92, 112 - Math.max(0, wave) * 9, -30, .68)}</g>`;
    }
    const blush = mode === "love" ? `<g data-layer="blush" opacity=".7">${ellipse(41, 89, 7, 3, PINK)}${ellipse(103, 89, 7, 3, PINK)}</g>` : "";
    if (gesture === "knead" || mode === "love") return blush + paw(cat, 47, 136 + wave * 3, -6, .55) + paw(cat, 96, 136 - wave * 3, 6, .55);
    if (gesture === "pounce") return paw(cat, 42, 125 - Math.max(0, wave) * 8, -18, .72) + paw(cat, 102, 125 - Math.max(0, wave) * 8, 18, .72);
    return blush;
}

function compactHead(cat, mode, phase, x, y, scale, namespace = '') {
    const whiskers = path("M37 98L16 94M36 104L14 106M107 98L128 94M108 104L130 106", CREAM, 2.8);
    const artwork = coat(cat, mode, phase, false, 0).replace(/(id="|url\(#)coat-/g, `$1${namespace}coat-`);
    return `<g data-layer="compact-face" transform="translate(${fixed(x)} ${fixed(y)}) scale(${fixed(scale)})">${artwork}<g data-layer="face"><g data-layer="eyes">${eyes(cat, mode, phase, "calm", "", false, 0, "")}</g>${mouth(cat, mode, phase)}${whiskers}</g></g>`;
}

function foodBowl(level = 1) {
    const amount = clamp(level);
    const kibble = [[72, 80], [64, 77], [81, 77], [59, 82], [85, 83], [71, 85], [51, 78], [93, 78], [62, 85], [81, 86], [43, 81], [102, 81], [54, 85], [92, 85], [59, 74], [84, 73], [71, 73], [38, 78], [107, 78], [46, 74], [98, 73], [48, 87], [98, 88], [78, 71]];
    const pieces = kibble.slice(0, Math.ceil(kibble.length * amount)).map(([x, y], index) => ellipse(x, y, 3.4, 2.4, index % 3 === 0 ? "#D2AF75" : "#805739")).join("");
    return `<g data-layer="food-bowl" data-level="${fixed(amount)}"><path d="M22 80Q27 118 43 125Q72 132 101 125Q118 118 122 80Z" fill="#D8CAB0" stroke="${BG}" stroke-width="3.5" stroke-linejoin="round"/>${ellipse(72, 80, 50, 17, CREAM)}${ellipse(72, 80, 43, 11.5, BG)}<g data-layer="food-fill">${amount > 0 ? ellipse(72, 81, 12 + amount * 29, 3 + amount * 7.5, "#A17443") + pieces : ""}</g>${path("M23 82Q28 116 43 122M121 82Q116 116 101 122", CREAM, 2.6)}<path d="M58 108Q72 96 85 108Q72 120 58 108ZM84 108L95 101V115Z" fill="${BG}"/>${ellipse(66, 107, 1.5, 1.5, CREAM)}</g>`;
}

function bowlEatingScene(cat, phase, level, pose = 'eat') {
    const dip = (1 + Math.sin(phase * TAU)) * 1.8;
    return `<g data-scene="normal-food">${compactHead(cat, pose === "watch" ? "waiting" : "bowl-eating", phase, 15.84, (pose === "watch" ? 1 : pose === "sniff" ? 6 : 9) + dip, .78)}<g transform="translate(12.96 32) scale(.82)">${foodBowl(level)}</g>${paw(cat, 34, 133, -12, .44)}${paw(cat, 111, 133, 12, .44)}</g>`;
}

function fullScene(cat, phase) {
    const c = COATS[cat];
    const breath = Math.sin(phase * TAU) * .8;
    return `<g data-scene="full-belly">${ellipse(72, 111, 42 + breath, 29, c.fill)}${ellipse(72, 116, 27 + breath, 21, c.muzzle)}${path("M31 114Q32 140 72 140Q112 140 113 114", c.outline, 3)}${compactHead(cat, "full", phase, 18.72, -3, .74)}${path("M53 119Q72 134 91 119", c.ink, 2.6)}${paw(cat, 42, 134, -12, .48)}${paw(cat, 102, 134, 12, .48)}</g>`;
}

function pukingScene(cat, phase, progress) {
    const c = COATS[cat];
    const wiping = progress >= .78;
    const retching = progress >= .24 && !wiping;
    const squeeze = retching ? (1 - Math.cos(progress * TAU * 5)) / 2 : 0;
    const breath = Math.sin(phase * TAU) * .35;
    const headY = (wiping ? 1 : 4 + squeeze * 3) + breath;
    const headScale = .7;
    const mouthY = headY + 115 * headScale;
    const puddle = progress >= .24 ? `<g data-layer="churu-puddle"><path d="M57 132Q51 128 58 125Q62 123 67 125Q73 121 79 124Q85 122 91 126Q100 126 98 131Q95 135 84 134Q77 138 69 134Q61 136 57 132Z" fill="#D7B280"/>${path("M63 128Q68 126 73 129M83 128L88 129", "#A17443", 2)}${ellipse(105, 130, 3, 1.8, "#D7B280")}</g>` : "";
    const spitPath = `M72 ${fixed(mouthY)}Q${fixed(68 + squeeze * 4)} 102 74 112`;
    const spit = retching ? `<g data-layer="churu-spit">${path(spitPath, "#A17443", 7.5)}${path(spitPath, "#D7B280", 5.2)}${ellipse(75, 119, 2.8, 3.7, "#D7B280")}</g>` : "";
    const face = compactHead(cat, wiping ? "full" : "puking", phase, 21.6, headY, headScale);
    const wipe = wiping ? `<g data-layer="mouth-wipe">${paw(cat, 83 - Math.sin((progress - .78) / .22 * Math.PI) * 12, 83, -28, .5)}</g>` : "";
    const retchCues = retching ? `<g data-layer="retch-cues">${path("M20 75L14 73M19 83H12M124 75L130 73M125 83H132", CREAM, 2.3)}</g>` : "";
    return `<g data-scene="too-many-treats" data-puke-stage="${wiping ? "wipe" : retching ? "retch" : "wind-up"}"><g data-layer="hunched-body">${ellipse(72, 103 + breath, 39 + squeeze, 27, c.fill)}${path("M34 102Q31 125 47 128M110 102Q113 125 97 128", c.outline, 3)}${paw(cat, 43, 122, -12, .45)}${paw(cat, 102, 122, 12, .45)}</g>${face}${puddle}${spit}${wipe}${retchCues}</g>`;
}

function litterTray(soil = 0, compact = false) {
    const positions = [[44, 89], [84, 77], [103, 95], [55, 72], [74, 97], [36, 101]];
    const clumps = positions.slice(0, soil).map(([x, y], index) => `<g data-layer="soil-clump" transform="translate(${x} ${y})">${ellipse(0, 2, 11, 5.5, "#6B5945")}${ellipse(-3, -2, 7, 4.5, "#8A7255")}${ellipse(4, -4, 4.5, 4, "#756044")}${path("M-4-3L0-5", "#AB9674", 1.5)}</g>`).join("");
    const grains = [[34, 75], [47, 71], [65, 78], [84, 66], [98, 72], [108, 85], [34, 96], [55, 100], [73, 91], [98, 103], [116, 97], [24, 86]].map(([x, y], index) => ellipse(x, y, 1.9, 1.3, index % 2 ? "#776F5C" : CREAM)).join("");
    const odor = soil >= LITTER_CAPACITY - 1 && !compact ? `<g data-layer="litter-odor">${path("M111 47Q102 40 111 32M126 58Q119 51 125 44", "#AB9C7F", 2.8)}</g>` : "";
    return `<g data-layer="litter-tray" data-soil="${soil}"><path d="M15 91L20 120Q23 132 38 134H111Q125 132 128 119L132 92Z" fill="#B7B19F" stroke="${BG}" stroke-width="3"/><path d="M29 60Q70 49 112 60L129 88Q136 107 118 115H26Q8 108 15 92Z" fill="${CREAM}" stroke="${BG}" stroke-width="3.5"/><path d="M33 66Q71 57 108 66L121 91Q126 101 113 107H30Q17 102 22 93Z" fill="#B6A78B"/>${grains}${clumps}${path("M22 117Q72 130 123 115", CREAM, 2.8)}${odor}</g>`;
}

function privacyMosaic(cat) {
    const c = COATS[cat];
    const colors = [c.fill, c.muzzle, "#B8AD95", "#877C68", "#D7CCB7", "#635E52"];
    let blocks = "";
    for (let row = 0; row < 5; row += 1) for (let col = 0; col < 9; col += 1) blocks += `<rect x="${36 + col * 8}" y="${85 + row * 8}" width="8" height="8" fill="${colors[(row * 7 + col * 3 + row * col) % colors.length]}"/>`;
    return `<g data-layer="privacy-mosaic" data-top="85" shape-rendering="crispEdges">${blocks}</g>`;
}

function litterScene(cat, phase, soil = 0, pose = 'use') {
    if (['inspect', 'dig', 'cover'].includes(pose)) {
        const moving = pose !== 'inspect', stroke = Math.sin(phase * TAU);
        return `<g data-scene="private-litter" data-litter-pose="${pose}">${compactHead(cat, moving ? 'content' : 'waiting', phase, 25.2, -7, .65)}<g transform="translate(8 40) scale(.88 .72)">${litterTray(soil,true)}</g>${moving ? paw(cat,72+stroke*11,102,-30+stroke*15,.48) + [0,1,2].map(i=>ellipse(96+i*7+stroke*3,99-i*5,1.8,1.2,CREAM)).join('') : ''}</g>`;
    }
    const c = COATS[cat];
    return `<g data-scene="private-litter"><g transform="translate(8 41) scale(.88 .72)">${litterTray(soil, true)}</g><g data-layer="private-body">${ellipse(72, 97, 31, 31, c.fill)}${path("M45 89Q34 119 46 130M99 89Q110 119 98 130", c.outline, 3)}</g>${compactHead(cat, "litter", phase, 26.64, -2 + Math.sin(phase * TAU) * .35, .63)}${privacyMosaic(cat)}</g>`;
}

function curiousHead(cat, phase, gaze = 0, innocent = false, motion = {}) {
    const eyesArt = [51, 93].map((cx, i) => {
        const ink = cat === 'calico' && i ? CREAM : COATS[cat].ink;
        if (motion.blink > .45) return path(`M${cx-10} 74Q${cx} 79 ${cx+10} 74`, ink, 3.2);
        return ellipse(cx, 73, innocent ? 13 : 11, innocent ? 15 : 11, CREAM)
            + ellipse(cx + gaze * 5, gaze ? 76 : 74, innocent ? 7 : 5, innocent ? 10 : 8, BG)
            + (innocent ? '' : path(`M${cx-11} 62Q${cx} 64 ${cx+10} 64`, ink, 2.7));
    }).join('');
    return coat(cat, 'content', phase, false, 0, { kind: 'ear', amount: motion.ear || 0 }) + `<g data-layer="eyes" data-gaze="${gaze ? 'item' : 'human'}">${eyesArt}</g>`
        + mouth(cat, 'content', phase) + path('M37 98L16 94M36 104L14 106M107 98L128 94M108 104L130 106', CREAM, 2.8);
}
function mischiefObject(kind, x, y, angle = 0) {
    const art = kind === 'plant'
        ? `<path d="M-10-18H10L7 0H-7Z" fill="${PINK}" stroke="${BG}" stroke-width="2.2"/>${path('M0-17V-35', '#A8BA8D', 3)}<path d="M0-28Q-17-40-14-25Q-9-20 0-23M0-31Q14-43 15-30Q10-23 0-25" fill="#A8BA8D"/>`
        : `${path('M9-23Q24-23 22-12Q19-5 10-8', CREAM, 4)}<path d="M-11-25H12L10-5Q9 0 2 0H-3Q-10 0-10-6Z" fill="${CREAM}" stroke="${BG}" stroke-width="2.2"/>${ellipse(.5,-24,10,3.2,'#805739')}${path('M-6-12H6',PINK,3)}`;
    return `<g data-prop="${kind === 'plant' ? 'plant' : 'mug'}" transform="translate(${fixed(x)} ${fixed(y)}) rotate(${fixed(angle)})">${art}</g>`;
}
function savedObjectArt(prop, progress, animate) {
    const time = animate ? (progress == null ? .35 : clamp(progress)) * 2.4 : 2.4;
    const enter = Math.min(1, time / .42), back = enter - 1;
    const pop = 1 + 2.70158 * back ** 3 + 1.70158 * back ** 2;
    const scale = 1.3 + .7 * pop, y = 88 + 12 * (1 - pop);
    const tilt = Math.sin(time * 14) * 8 * Math.max(0, 1 - time / 1.1) ** 2;
    const ripples = [0, .24].map(delay => {
        const p = (time - delay) / 1.35;
        if (p <= 0 || p >= 1) return '';
        const radius = 18 + 72 * (1 - (1 - p) ** 2);
        const opacity = Math.min(1, p * 7) * (1 - p) ** 1.4 * .48;
        return `<circle cx="72" cy="68" r="${fixed(radius)}" fill="none" stroke="${CREAM}" stroke-width="${fixed(2.4 - p)}" opacity="${fixed(opacity)}"/>`;
    }).join('');
    const label = clamp((time - .12) / .2);
    return `<g data-scene="saved-object"><g data-layer="catch-ripples">${ripples}</g><g data-layer="caught-item" transform="translate(72 ${fixed(y)}) rotate(${fixed(tilt)}) scale(${fixed(scale)})">${mischiefObject(prop,0,0)}</g><text x="72" y="${fixed(132 + (1 - label) * 4)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="${CREAM}" opacity="${fixed(label)}">SAVED!</text></g>`;
}
function mischiefArt(cat, phase, scene = {}, animate = true) {
    const kind = scene.kind || 'look-human', p = animate ? clamp(scene.progress) : .5;
    const time = animate ? Math.max(0, Number.isFinite(scene.elapsedMs) ? scene.elapsedMs : p * (scene.durationMs || 5_000)) : 0;
    phase = animate ? phase : .18;
    // The saved step clock keeps little gestures deterministic across redraws,
    // holds and restarts without changing when the next nudge will happen.
    const looking = kind === 'look-human' || kind === 'look-item';
    const beatMs = 3_200 + Math.abs(Math.round((scene.from || 82) * 97 + (scene.durationMs || 0))) % 1_900;
    const slot = Math.floor(time / beatMs), beat = time % beatMs;
    const pulse = animate && looking && beat > beatMs - 850 ? Math.sin((beat - beatMs + 850) / 850 * Math.PI) : 0;
    const motion = { blink: slot % 3 === 0 ? pulse : 0, ear: slot % 3 === 2 ? pulse : 0 };
    const breath = animate && looking ? Math.sin(time / 4_200 * TAU) * .65 : 0;
    const ease = p*p*(3-2*p), from = Number.isFinite(scene.from) ? scene.from : 91, to = Number.isFinite(scene.to) ? scene.to : from;
    let x = from + (to-from)*ease, y = 111, angle = 0;
    if (kind === 'balance') angle = Math.sin(phase*TAU*2)*6;
    if (kind === 'fall') { x = 122+p*24; y += p*p*100; angle = p*150; }
    const washing = kind.startsWith('wash-'), left = kind === 'wash-left';
    const nudge = ['nudge','push'].includes(kind), baseGaze = ['look-item','nudge','push','balance'].includes(kind) ? 1 : 0;
    const gaze = looking && slot % 3 === 1 ? baseGaze + (1 - 2 * baseGaze) * pulse : baseGaze;
    const face = washing ? compactHead(cat,'grooming',phase,-6,3,.71) : `<g transform="translate(-6 ${fixed(3 + breath)}) scale(.71)">${curiousHead(cat,phase,gaze,kind==='fall',motion)}</g>`;
    const groomingPaw = washing ? paw(cat,left?36:50,73-Math.max(0,Math.sin(phase*TAU))*4,left?30:-30,.46) : '';
    return `<g data-scene="mischief" data-step="${xml(kind)}">${ellipse(44,104+breath,32,30,COATS[cat].fill)}${face}<path d="M0 113H114V144H0Z" fill="#292C28"/>${path('M0 112H114V144','#ABA58F',3.3)}${paw(cat,23,112,-8,.48)}${mischiefObject(scene.prop,x,y,angle)}${washing?groomingPaw:paw(cat,nudge?x-16:kind==='balance'?88:63,nudge?101:108-motion.ear*2,nudge?53:15,.57)}</g>`;
}
function mouseArt(time, animate) {
    const t = animate ? time / 1000 : 2;
    const x = t < 1 ? -24 + t*96 : t < 3.25 ? 72 : 72+(t-3.25)*140;
    const wide = t >= 1.5;
    return `<g data-scene="mouse-visitor" transform="translate(${fixed(x)} 100)">${path('M-12 5Q-37 8-32-6','#B8AD95',2)}${ellipse(0,0,13,8,'#A3A69B')}${ellipse(10,-4,10,8,'#A3A69B')}${ellipse(5,-12,5.5,6,'#B8AD95')}${ellipse(6,-12,3,3.5,PINK)}${ellipse(16,-12,5,5.5,'#B8AD95')}${ellipse(16,-12,2.5,3,PINK)}${ellipse(8,-4,wide?4:2,wide?5:2,CREAM)}${ellipse(17,-4,wide?4:2,wide?5:2,CREAM)}${ellipse(8,-3,1.8,2.5,BG)}${ellipse(17,-3,1.8,2.5,BG)}${ellipse(23,1,2,1.6,PINK)}</g>`;
}
function doorCat(cat, phase, beat, throughWindow = false) {
    const c = COATS[cat], action = beat.kind || 'sit';
    const time = (beat.elapsedMs || 0) / 1000;
    const frantic = action === 'frantic', scratching = action === 'scratch' || frantic;
    const stroke = offset => (1 - Math.cos((time * (frantic ? 4.5 : 2.2) + offset) * TAU)) / 2;
    const arm = (fromX, fromY, toX, toY, angle = 0) => {
        const d = `M${fromX} ${fromY}Q${fromX+5} ${toY+13} ${fixed(toX)} ${fixed(toY)}`;
        return path(d, c.outline, 13) + path(d, c.paw, 9) + paw(cat,fixed(toX),fixed(toY),angle,.39);
    };
    const body = `${path('M42 129Q12 137 15 115Q17 107 23 110',c.outline,10)}${path('M42 129Q12 137 15 115Q17 107 23 110',c.fill,6)}${ellipse(56,109,28,25,c.fill)}${ellipse(56,114,16,18,c.muzzle)}`;
    const face = action === 'wash' ? compactHead(cat,'grooming',time%1,6,19,.69)
        : `<g transform="translate(6 ${fixed(19+(frantic?stroke(0)*1.5:0))}) scale(.69)">${curiousHead(cat,phase,scratching&&!throughWindow?1:0,throughWindow)}</g>`;
    let paws = paw(cat,40,129,-5,.40) + paw(cat,73,129,5,.40);
    if (action === 'wash') paws = paw(cat,40,129,-5,.40) + arm(72,114,65,86-stroke(0)*3,-27);
    else if (scratching) {
        const y = 70 + stroke(0) * 19;
        paws = paw(cat,40,129,-5,.40) + arm(72,111,throughWindow?80:102,y,throughWindow?0:40);
        if (frantic) paws = arm(42,111,throughWindow?40:95,70+stroke(.5)*19,throughWindow?0:40)
            + arm(72,111,throughWindow?80:108,y,throughWindow?0:40);
    }
    return `<g data-door-action="${action}">${body}${face}${paws}</g>`;
}
function waitingDoor(cat, phase, trip, animate) {
    const incoming = trip.kind === 'waiting-in';
    const beat = animate ? trip.door || {kind:'sit',elapsedMs:0} : {kind:'sit',elapsedMs:0};
    if (incoming) {
        // The returning cat is outside, seen through the closed door window.
        return `<g data-scene="door" data-direction="waiting-in"><rect x="14" y="5" width="118" height="137" rx="7" fill="#373D34" stroke="#AFA791" stroke-width="3"/><defs><clipPath id="door-window"><rect x="23" y="13" width="100" height="108" rx="4"/></clipPath></defs><rect x="23" y="13" width="100" height="108" rx="4" fill="#26383C"/><g clip-path="url(#door-window)"><g transform="translate(16 -1)">${doorCat(cat,phase,beat,true)}</g></g><rect x="23" y="13" width="100" height="108" rx="4" fill="none" stroke="#8D9988" stroke-width="3"/><rect x="19" y="122" width="108" height="7" rx="2" fill="#AFA791"/>${ellipse(119,135,3,3,CREAM)}</g>`;
    }
    return `<g data-scene="door" data-direction="waiting-out"><rect x="98" y="8" width="40" height="127" rx="3" fill="#373D34" stroke="#AFA791" stroke-width="3"/>${path('M106 20H130V61H106ZM106 81H130V124H106Z','#676E5C',2)}${ellipse(129,72,3,3,CREAM)}${doorCat(cat,phase,beat)}</g>`;
}
function outdoorArt(cat, phase, trip = {}, animate = true) {
    const kind = trip.kind || 'away';
    if (kind === 'waiting-out' || kind === 'waiting-in') {
        return waitingDoor(cat,phase,trip,animate);
    }
    if (kind === 'leaving' || kind === 'returning') {
        const p = animate ? clamp(trip.elapsedMs/2000) : .5;
        const ease = p*p*(3-2*p), doorOpacity = 1-ease;
        const doorway = `<g opacity="${fixed(doorOpacity)}"><rect x="20" y="7" width="104" height="132" rx="5" fill="#26383C" stroke="#AFA791" stroke-width="4"/><path d="M20 8L3 23V125L20 138Z" fill="#373D34" stroke="#AFA791" stroke-width="3"/></g>`;
        if (kind === 'returning') {
            const scale = .35 + .65*ease;
            return `<g data-scene="outdoor-transition" data-direction="returning">${doorway}<g transform="translate(${fixed(72*(1-scale))} ${fixed(138*(1-scale))}) scale(${fixed(scale)})">${ellipse(72,122,32,18,COATS[cat].fill)}${curiousHead(cat,phase,0,true)}${paw(cat,42,135-Math.sin(p*TAU*2)*3,-5,.46)}${paw(cat,102,135+Math.sin(p*TAU*2)*3,5,.46)}</g></g>`;
        }
        const c = COATS[cat], scale = 1-.78*ease;
        return `<g data-scene="outdoor-transition" data-direction="leaving">${doorway}<g opacity="${fixed(1-Math.max(0,(p-.75)*4))}" transform="translate(${fixed(72*(1-scale))} ${fixed(138*(1-scale))}) scale(${fixed(scale)})">${ellipse(72,109,29,29,c.fill)}<g data-layer="back-of-head">${coat(cat,'content',phase,false,0)}</g>${path(`M87 130Q113 137 119 109Q124 85 ${fixed(114+Math.sin(p*TAU*2)*4)} 76`,c.outline,11)}${path(`M87 130Q113 137 119 109Q124 85 ${fixed(114+Math.sin(p*TAU*2)*4)} 76`,c.fill,7)}</g></g>`;
    }
    if (trip.feedback) return `<g data-scene="outdoor-message" fill="${CREAM}" font-family="Arial,sans-serif" text-anchor="middle" font-weight="700"><text x="72" y="69" font-size="19">OUT</text><text x="72" y="91" font-size="14">WANDERING</text></g>`;
    const marker = `<g data-scene="away-paw" transform="translate(112 112)" fill="#737B68"><ellipse cy="5" rx="6" ry="4.5"/><ellipse cx="-5" cy="-3" rx="2.3" ry="3"/><ellipse cx="1" cy="-5" rx="2.3" ry="3"/><ellipse cx="7" cy="-2" rx="2.3" ry="3"/></g>`;
    return marker + (trip.mouseElapsedMs !== null && trip.mouseElapsedMs !== undefined ? mouseArt(trip.mouseElapsedMs,animate) : '');
}
function sharedEatingScene(diners, phase, level) {
    const count = diners.length;
    if (count === 1) return bowlEatingScene(diners[0].cat,diners[0].phase ?? phase,level,diners[0].pose);
    const scale = count === 2 ? .53 : count === 3 ? .31 : .40;
    const cols = count === 4 ? 2 : count;
    const gap = 4, left = (144-cols*144*scale-(cols-1)*gap)/2;
    const faces = diners.map((diner,i) => `<g data-diner="${xml(diner.id || i)}" data-coat="${diner.cat}">${compactHead(diner.cat,diner.pose === 'watch' ? 'waiting' : 'bowl-eating',Number.isFinite(diner.phase) ? diner.phase : phase,left+(i%cols)*(144*scale+gap),(count===4?2+Math.floor(i/2)*43:count===2?16:34)+Math.sin(phase*TAU+i)*1.2,scale,`diner-${i}-`)}</g>`).join('');
    return `<g data-scene="shared-food" data-diners="${count}">${faces}<g transform="translate(6 20) scale(.92)">${foodBowl(level)}</g></g>`;
}

const biscuitNumber = n => Number(n.toFixed(3));
function biscuitHead(cat) {
  const eyes = [51,93].map(cx => `<path d="M${cx-11} 69H${cx+11}Q${cx+12} 84 ${cx} 84Q${cx-12} 84 ${cx-11} 69Z" fill="${CREAM}"/>`
    + ellipse(cx,76,3.2,6,BG) + path(`M${cx-12} 68H${cx+12}`,BG,3)).join('');
  const ink = cat === 'black' ? CREAM : BG;
  return coat(cat, "content", 0, false, 0) + `<g data-expression="biscuit-concentration">${eyes}<path d="M66 94Q72 90 78 94Q75 100 72 100Q68 98 66 94Z" fill="${PINK}"/>${path('M72 100V105M61 106Q66 109 72 105Q78 109 83 106',ink,3)}${path('M37 98L16 94M36 104L14 106M107 98L128 94M108 104L130 106',CREAM,2.8)}</g>`;
}
function kneadingPaw(cat, x, pressure, side) {
  const { outline: coatOutline, paw: pawFill } = COATS[cat];
  const outline = cat === 'tuxedo' ? BG : coatOutline;
  const y = 105 + pressure*15, spread = 1 + pressure*.12;
  const shape = 'M-10-30Q-14-18-13-5Q-20 0-17 9Q-14 16-7 13Q-1 19 5 13Q15 17 18 8Q21 0 13-5Q14-19 10-30';
  return `<g data-paw="${side}" data-pressure="${biscuitNumber(pressure)}" transform="translate(${x} ${biscuitNumber(y)}) scale(${biscuitNumber(spread)} ${biscuitNumber(1-pressure*.14)})"><path d="${shape}Z" fill="${pawFill}"/>${path(shape,outline,2.6)}${path('M-7 8V12M4 8V13',outline,1.7)}</g>`;
}
function biscuitArt(cat, time=0, rhythm='steady', animate=true, pause=false, wash=false) {
  if (!['slow', 'steady', 'happy'].includes(rhythm)) rhythm = 'steady';
  const seconds = Number.isFinite(time) ? time : 0;
  const rate = ({slow:.55,steady:.8,happy:1.15})[rhythm] || .8;
  const phase = animate ? pause ? .25 : seconds*rate : .08;
  wash = animate && wash;
  const wave = Math.cos(phase*TAU);
  const left = (1+wave)/2, right = 1-left;
  const { fill, muzzle, outline } = COATS[cat];
  const sway = -wave*(rhythm==='happy'?3:1.5), bob = Math.cos(phase*TAU*2)*(rhythm==='happy'?1.7:.7);
  const blanket = `<g data-layer="blanket"><path d="M8 119Q8 111 22 112L34 113Q47 ${biscuitNumber(112+left*7)} 60 113H84Q97 ${biscuitNumber(112+right*7)} 110 113L122 112Q136 111 136 119V132Q135 141 124 141H20Q8 140 8 132Z" fill="#758366" stroke="#A6B38F" stroke-width="2.5"/>${path('M16 132Q40 137 72 134Q104 137 128 132','#56644C',2)}</g>`;
  const body = `<g transform="translate(${biscuitNumber(sway*.5)} ${biscuitNumber(bob)})">${ellipse(72,89,32,32,fill)}${ellipse(72,101,20,25,muzzle)}${path('M41 105Q38 121 46 125M103 105Q106 121 98 125',outline,2.5)}</g>`;
  const head = `<g transform="translate(${biscuitNumber(17.28+sway)} ${biscuitNumber(-7+bob)}) rotate(${biscuitNumber(sway*.55)} 54 65) scale(.76)">${biscuitHead(cat)}</g>`;
  return `<g data-scene="biscuits" data-cat="${cat}" data-rhythm="${rhythm}">${body}${blanket}${kneadingPaw(cat,47,left,'left')}${wash ? paw(cat,91,74,-22,.65) : kneadingPaw(cat,97,right,'right')}${head}${wash ? ellipse(83,77,2.6,4,PINK) : ''}</g>`;
}


function habitArt(cat, mode, phase, buddy, role, progress) {
    const c = COATS[cat], wave = Math.sin(phase * TAU), right = role === 'right';
    if (mode === 'watching') return `<g data-scene="watching" transform="rotate(${fixed(wave * 2)} 72 90)">${curiousHead(cat, phase, phase < .3 ? -1 : phase > .7 ? 1 : 0)}</g>`;
    if (mode === 'stretching') {
        const stretch = Math.sin(progress * Math.PI);
        return `<g data-scene="stretching">${ellipse(72,96,31,35,c.fill)}${ellipse(72,105,20,29,c.muzzle)}${compactHead(cat,'settling',phase,25.2,12-stretch*8,.65)}${paw(cat,42-stretch*9,118+stretch*11,-15,.65)}${paw(cat,102+stretch*9,118+stretch*11,15,.65)}${ellipse(72,88-stretch*8,3+stretch*3,2+stretch*6,BG)}</g>`;
    }
    if (mode === 'stalking') return `<g data-scene="stalking">${path(`M105 119Q${126+wave*3} 101 115 82`,c.fill,12)}${ellipse(72,112,42,22,c.fill)}<g transform="translate(${fixed(15.84+wave*1.5)} 24) scale(.78)">${curiousHead(cat,phase,wave*.4)}</g>${paw(cat,38,134,-8,.5)}${paw(cat,106,134,8,.5)}</g>`;
    const first = right ? buddy : cat, second = right ? cat : buddy;
    const resting = mode === 'resting-together', grooming = mode === 'grooming-together';
    const nuzzle = resting ? 0 : (1-Math.cos(phase*TAU))*2;
    const faceMode = resting ? 'asleep' : 'happy';
    return `<g data-scene="${mode}">${ellipse(48,111,36,24,COATS[first].fill)}${ellipse(97,112,35,24,COATS[second].fill)}${compactHead(first,faceMode,phase,2+nuzzle,39,.53,'companion-left-')}${compactHead(second,faceMode,phase,67-nuzzle,38,.53,'companion-right-')}${grooming ? ellipse(77,76,3,3+Math.max(0,wave)*5,PINK) : ''}${resting ? '' : paw(cat,right?103:40,133,right?12:-12,.45)}</g>`;
}

/** Render a 144 px frame. All markings, expressions and props remain editable SVG. */
export function renderKey(options = {}) {
    const cat = CATS.find(item => item.id === options.cat) || CATS[0];
    const mode = MODES.find(item => item.id === options.mode) || MODES[0];
    const number = Number(options.phase);
    const phase = Number.isFinite(number) ? ((number % 1) + 1) % 1 : 0;
    const aliases = { 'mischief-sulk': 'social-grumpy', disappointed: 'angry', 'food-sulk': 'grumpy' };
    if (aliases[mode.id]) return renderKey({ ...options, mode: aliases[mode.id] }).replace(`data-mode="${aliases[mode.id]}"`, `data-mode="${mode.id}"`);
    if (['mischief','outside','door-in','door-out','saved','innocent','biscuits','watching','stretching','stalking','greeting','grooming-together','resting-together'].includes(mode.id)) {
        const art = ['watching','stretching','stalking','greeting','grooming-together','resting-together'].includes(mode.id)
            ? habitArt(cat.id, mode.id, phase, CATS.find(c => c.id === options.buddyCat)?.id || cat.id, options.socialRole, options.animate === false ? .4 : clamp(options.effectProgress))
            : mode.id === 'biscuits' ? biscuitArt(cat.id, options.biscuitsScene?.time ?? phase / .8, options.biscuitsScene?.rhythm, options.animate !== false, options.biscuitsScene?.pause === true, options.biscuitsScene?.wash === true)
            : mode.id === 'mischief' ? mischiefArt(cat.id,phase,options.mischiefScene,options.animate !== false)
            : mode.id === 'innocent' ? curiousHead(cat.id,phase,0,true)
            : mode.id === 'saved' ? savedObjectArt(options.savedProp, options.effectProgress, options.animate !== false)
            : outdoorArt(cat.id,phase,options.outdoorScene || {kind:mode.id==='door-out'?'waiting-out':mode.id==='door-in'?'waiting-in':'away'},options.animate !== false);
        const hold = clamp(options.holdProgress);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" role="img" aria-label="${xml(mode.label)}"><title>${xml(mode.label)}</title><rect width="144" height="144" fill="${BG}"/><g data-cat="${cat.id}" data-mode="${mode.id}">${art}</g>${hold?`<rect data-feedback="hold" x="8" y="3" width="${fixed(128*hold)}" height="3" rx="1.5" fill="${CREAM}" opacity=".7"/>`:''}</svg>`;
    }
    const micro = options.animate !== false && options.micro && ['still','blink','glance','ear','peek'].includes(options.micro.kind)
      ? { kind: options.micro.kind, amount: clamp(options.micro.amount), direction: options.micro.direction === -1 ? -1 : 1 } : null;
    const variant = ["sleep", "calm", "wild"].includes(options.variant) ? options.variant : "calm";
    const gesture = typeof options.gesture === "string" ? options.gesture : "";
    const treatStyle = typeof options.treatStyle === "string" ? options.treatStyle : "";
    const groomPaused = mode.id === "grooming" && options.animate !== false && options.groomPause === true;
    const groomPart = ["left-paw", "right-paw", "tail"].includes(options.groomPart) ? options.groomPart : "right-paw";
    const buddyCat = CATS.find(item => item.id === options.buddyCat)?.id || cat.id;
    const socialRole = options.socialRole === "right" ? "right" : "left";
    // Feeding can temporarily occupy the face while the cat still needs space.
    const overloadWarning = options.overloadWarning === true && ["eating", "guarding", "grooming"].includes(mode.id);
    const recovery = mode.id === "recovering" ? options.effectProgress == null ? .4 : clamp(options.effectProgress) : 0;
    const wave = Math.sin(phase * TAU);
    const attacking = mode.id === "attack";
    const angry = mode.id === "angry";
    const socialPlay = mode.id === "playing-together";
    const squabbling = mode.id === "squabbling";
    const sulking = ["jealous", "social-grumpy"].includes(mode.id);
    const lunge = attacking ? (1 - Math.cos(phase * TAU)) / 2 : 0;
    const energetic = mode.id === "zoomies" || (mode.id === "playfight" && variant === "wild");
    const loving = ["happy", "love"].includes(mode.id);
    const eating = ["eating", "guarding"].includes(mode.id);
    const retreat = mode.id === "recovering" ? 18 * (1 - recovery) + 4 : mode.id === "overstimulated" ? 12 : overloadWarning ? 6 : 0;
    const rub = gesture === "cheek-rub" ? wave * 4 : 0;
    const nuzzle = gesture === "headbutt" ? Math.max(0, wave) * 4 : 0;
    const bob = socialPlay ? wave * 1.3 : squabbling ? Math.sin(phase * TAU * 2) * 1.5 : sulking ? 2 + wave * .2 : attacking ? 3 - lunge * 5 : angry ? 2 + wave * .25 : retreat + (energetic ? Math.sin(phase * TAU * 2) * 2 : loving ? -Math.sin(phase * Math.PI) * (variant === "wild" ? 3 : 1.8) : eating ? wave * .9 : wave * .7) - nuzzle;
    const angle = socialPlay ? wave * 3 : squabbling ? wave * 4 : sulking ? -3 : attacking ? wave * 2.5 : angry ? -3 : energetic ? wave * 5 : mode.id === "waiting" ? -4 : ["enough", "annoyed"].includes(mode.id) ? -7 : mode.id === "grumpy" ? wave * .8 : loving ? wave * (variant === "sleep" ? 1 : 3) + rub : eating ? 3 + wave * 1.2 : 0;
    const x = attacking ? wave * 2 : angry ? 1 : (energetic ? wave * 3 : 0) + rub;
    const scale = attacking ? 1.03 + lunge * .05 : mode.id === "recovering" ? .89 + .08 * recovery : mode.id === "overstimulated" ? .94 : 1 + nuzzle * .003;
    const scaleY = mode.id === "asleep" ? 1 + wave * .012 : 1;
    const faceX = mode.id === "jealous" ? 3 : mode.id === "social-grumpy" ? -3 : angry ? 3 : ["enough", "annoyed"].includes(mode.id) ? -5 : mode.id === "warning" ? -1.5 : 0;
    const whiskers = path("M37 98L16 94M36 104L14 106M107 98L128 94M108 104L130 106", CREAM, 2.8);
    const title = `${cat.label}: ${mode.label.toLowerCase()}`;
    const hold = clamp(options.holdProgress);
    const holdCue = hold > 0 ? `<rect data-feedback="hold" x="8" y="3" width="${fixed(128 * hold)}" height="3" rx="1.5" fill="${CREAM}" opacity=".7"/>` : "";
    const special = ["bowl-eating", "full", "litter", "puking"].includes(mode.id);
    const content = mode.id === "bowl-eating" ? bowlEatingScene(cat.id, phase, options.foodLevel == null ? 1 - clamp(options.mealProgress) : clamp(options.foodLevel), options.diningPose)
        : mode.id === "full" ? fullScene(cat.id, phase)
            : mode.id === "puking" ? pukingScene(cat.id, phase, options.effectProgress == null ? .5 : clamp(options.effectProgress))
            : mode.id === "litter" ? litterScene(cat.id, phase, Math.min(LITTER_CAPACITY, Math.max(0, Math.floor(Number(options.soil) || 0))), options.litterPose)
                : `${coat(cat.id, mode.id, phase, overloadWarning, recovery, micro)}<g data-layer="face" transform="translate(${faceX} 0)"><g data-layer="eyes">${eyes(cat.id, groomPaused ? "content" : mode.id, phase, variant, gesture, overloadWarning, recovery, treatStyle, micro)}</g>${mouth(cat.id, groomPaused ? "content" : mode.id, phase, groomPart)}${whiskers}</g>${accessories(cat.id, mode.id, groomPaused ? .25 : phase, variant, gesture, treatStyle, groomPart, buddyCat, socialRole)}`;
    const transform = special ? "translate(0 0)" : `translate(${fixed(x)} ${fixed(bob)}) rotate(${fixed(angle)} 72 80) translate(72 120) scale(${scale.toFixed(4)} ${(scale * scaleY).toFixed(4)}) translate(-72 -120)`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" role="img" aria-label="${xml(title)}"><title>${xml(title)}</title><rect width="144" height="144" fill="${BG}"/>${tail(cat.id, mode.id, phase)}<g data-cat="${cat.id}" data-mode="${mode.id}" data-variant="${variant}" data-gesture="${xml(gesture)}" data-treat-style="${xml(treatStyle)}" data-groom-part="${groomPart}" transform="${transform}">${content}</g>${cues(mode.id, phase, options.affectionate === true, overloadWarning, treatStyle)}${holdCue}</svg>`;
}

export function renderButton(options = {}) {
    return `data:image/svg+xml,${encodeURIComponent(renderKey(options))}`;
}

// Only retain the current artwork per key. Care meters and bookkeeping clocks
// may change without affecting any pixels. Holds and scene details remain inputs.
const CAT_ART_FIELDS = ['cat', 'mode', 'phase', 'buddyCat', 'socialRole', 'animate', 'effectProgress',
    'biscuitsScene', 'mischiefScene', 'savedProp', 'outdoorScene', 'holdProgress', 'micro', 'variant',
    'gesture', 'treatStyle', 'groomPause', 'groomPart', 'overloadWarning', 'foodLevel', 'mealProgress',
    'diningPose', 'soil', 'litterPose', 'affectionate'];
const RESOURCE_ART_FIELDS = ['kind', 'cat', 'active', 'eating', 'using', 'level', 'soil', 'phase',
    'progress', 'diners', 'diningPose', 'litterPose', 'holdProgress', 'cleanedOpacity'];

function artworkCache(render, fields, resource = false) {
    let previousKey, image;
    return (options = {}) => {
        const occupied = !resource || options.active !== false && (options.kind === 'litter' ? options.using : options.eating);
        const key = JSON.stringify(fields.map(field => resource && !occupied && ['phase', 'diners', 'diningPose', 'litterPose'].includes(field)
            ? null : options[field]));
        if (key !== previousKey) { image = render(options); previousKey = key; }
        return image;
    };
}

export function createButtonRenderer(render = renderButton) { return artworkCache(render, CAT_ART_FIELDS); }
export function createResourceRenderer(render = renderResourceButton) { return artworkCache(render, RESOURCE_ART_FIELDS, true); }

/** Draw a shared food or litter key without adding labels inside its artwork. */
export function renderResource(options = {}) {
    const kind = options.kind === "litter" ? "litter" : "food";
    const cat = CATS.find(item => item.id === options.cat) || CATS[0];
    const active = options.active !== false;
    const occupied = active && (kind === "food" ? options.eating === true : options.using === true);
    const level = options.level == null ? 1 : clamp(options.level);
    const soil = Math.min(LITTER_CAPACITY, Math.max(0, Math.floor(Number(options.soil) || 0)));
    const number = Number(options.phase);
    const phase = Number.isFinite(number) ? ((number % 1) + 1) % 1 : 0;
    const progress = clamp(options.progress);
    const title = kind === "food" ? occupied ? `${cat.label} eating from the food bowl` : level === 0 ? "Empty food bowl" : "Food bowl"
        : occupied ? `${cat.label} using the litter tray` : soil === 0 ? "Clean litter tray" : soil >= LITTER_CAPACITY ? "Dirty litter tray" : "Used litter tray";
    const diners = Array.isArray(options.diners) ? options.diners.filter(diner => CATS.some(coat => coat.id === diner.cat)).slice(0,4) : [];
    const art = kind === "food" ? occupied ? diners.length ? sharedEatingScene(diners, phase, level) : bowlEatingScene(cat.id, phase, level, options.diningPose) : `<g transform="translate(0 -15)">${foodBowl(level)}</g>`
        : occupied ? litterScene(cat.id, phase, soil, options.litterPose) : `<g transform="translate(0 -14)">${litterTray(soil)}</g>`;
    const dots = occupied ? `<g data-layer="resource-use">${[0, 1, 2].map(index => ellipse(64 + index * 8, 139, 1.8, 1.8, progress >= index / 3 ? CREAM : "#51554B")).join("")}</g>` : "";
    const label = active ? title : `${title}, inactive`;
    const hold = active && kind === "litter" ? clamp(options.holdProgress) : 0;
    const cleaned = active && kind === "litter" ? clamp(options.cleanedOpacity) : 0;
    const cleanedCue = cleaned > 0 ? `<g data-feedback="cleaned" opacity="${cleaned}"><circle cx="72" cy="72" r="30.1875" fill="#3D8B58"/><path d="M60 72L68 80L85 63" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></g>` : "";
    const holdCue = hold > 0 ? `<rect data-feedback="hold" x="8" y="3" width="${fixed(128 * hold)}" height="3" rx="1.5" fill="${CREAM}" opacity=".7"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" role="img" aria-label="${xml(label)}"><title>${xml(label)}</title><rect width="144" height="144" fill="${BG}"/><g data-resource="${kind}" data-active="${active}" data-occupied="${occupied}" data-progress="${fixed(progress)}" opacity="${active ? "1" : ".45"}">${art}${dots}</g>${cleanedCue}${holdCue}</svg>`;
}

export function renderResourceButton(options = {}) {
    return `data:image/svg+xml,${encodeURIComponent(renderResource(options))}`;
}
