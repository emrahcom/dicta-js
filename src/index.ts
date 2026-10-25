// The entry module of dicta-js. Importing it defines <dicta-input>.

import { DictaInput } from "./input.ts";

if (!customElements.get("dicta-input")) {
  customElements.define("dicta-input", DictaInput);
}

export { DictaInput };
