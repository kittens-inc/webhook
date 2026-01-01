# webhook
webhook handler for cats.tf.

![](https://img.shields.io/badge/Bun-1.3.3-000?style=for-the-badge)
![](https://img.shields.io/badge/TypeScript-5.9.0-000?style=for-the-badge)

## Setup

<!-- dont include git cloning -->
```bash
$ bun install
$ bun run src/main.ts
```

## Docker

```bash
$ docker build -t webhook .
$ docker run -p 3000:3000 -v $(pwd)/config.toml:/app/config.toml webhook
```

## Credit
original project: https://github.com/catgir-ls/webhook
