// One lens per artifact family. Adding a section to the artifact means
// adding a file here that names what it reads; until then the section
// shows under "Other sections", raw.
import { Family } from "../artifact";
import { program } from "./program";
import { tower } from "./tower";
import { bus } from "./bus";
import { placement } from "./placement";
import { law } from "./law";
import { holes } from "./holes";
import { lifecycle } from "./lifecycle";
import { effects } from "./effects";
import { unreadSections } from "./extra";

const lenses: Family[] = [program, tower, lifecycle, bus, placement, effects, law, holes];
const claimed = new Set<string>(lenses.flatMap((f) => f.reads as string[]));
// Sections every lens reads implicitly for navigation.
for (const k of ["sources", "provenance"]) claimed.add(k);

export const families: Family[] = [...lenses, unreadSections(claimed)];
export { program, tower, bus, placement, law, holes, lifecycle, effects };
