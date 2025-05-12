## win-mouse

> `win-mouse` is a Windows-based mouse tracking that reports screen coordinates of mouse events, including when other applications are active in the foreground.

### Installation

Install the package:

```bash
pnpm add -D @lazuee/win-mouse
```

### Usage

```js
import { WinMouse } from "@lazuee/win-mouse";
const mouse = new WinMouse();

mouse.on("mouse", console.log);
setTimeout(() => mouse.destroy(), 5_000);

```

For a usage example, check the [`test/`](./test) directory.

### License

This project is licensed under the MIT License - see the [LICENSE.md](./LICENSE.md) file for details

Copyright © `2025` `lazuee`