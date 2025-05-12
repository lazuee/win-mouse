// eslint-disable-next-line antfu/no-import-dist
import { WinMouse } from "../dist/index.mjs";

const m1 = new WinMouse();

m1.on("mouse", (obj) => {
  console.log("mouse_1", obj);
});

setTimeout(() => {
  m1.unref();
  console.log("unref_1");

  const m2 = new WinMouse();

  m2.on("mouse", (obj) => {
    console.log("mouse_2", obj);
  });

  setTimeout(() => {
    m2.unref();
    console.log("unref_2");
  }, 1000);
}, 1000);
