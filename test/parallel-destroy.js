// eslint-disable-next-line antfu/no-import-dist
import { WinMouse } from "../dist/index.mjs";

const m1 = new WinMouse();
const m2 = new WinMouse();

m1.on("mouse", (obj) => {
  console.log("mouse_1", obj);
});

m2.on("mouse", (obj) => {
  console.log("mouse_2", obj);
});

setTimeout(() => {
  m1.destroy();
  console.log("destroy_1");

  setTimeout(() => {
    m2.destroy();
    console.log("destroy_2");
  }, 1000);
}, 1000);
