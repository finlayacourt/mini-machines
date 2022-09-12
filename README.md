![mini machines](https://user-images.githubusercontent.com/19372421/189712046-387f7be4-52e6-4d9f-a108-943466cf6015.png)

<p align="center">Simple & typesafe client-server communication</p>

## Installation

mini-machines requires TypeScript ≥ 4.1 for Template Literal Types and node ≥ 12 for async functions.

```bash
$ npm install mini-machines
```

## Guide

### Define machines on the server

```typescript
import * as m from "./server"

m.router({
  products: m.machine({
    resolve: async () => {
      let products = await get_products()
      return { products }
    },
  }),
  product: m.machine({
    input: (raw) => {
      return validate_input(raw)
    },
    resolve: async ({ input }) => {
      let product = await get_product(input)
      return { product }
    },
  }),
})
```

### Use contexts to create route guards

```typescript
m.router({
  login: m.machine({
    input: (raw) => {
      return validate_input(raw)
    },
    resolve: async ({ input, cookies }) => {
      let session = await create_session(input)
      cookies.set("session", session)
      return { session }
    },
  }),
  user: m
    .context(async ({ cookies }) => {
      let user = await get_user(cookies.get("session"))
      if (!user) throw new Unauthorized("Session expired")
      return { user }
    })
    .router({
      profile: m.machine({
        resolve: async ({ context }) => {
          let profile = await get_profile(context.user)
          return { profile }
        },
      }),
    }),
})
```

### Turn your machine into a server handler

```typescript
m.create({
  router,
  prefix: "/",
  on_error: ({ path, error }) => {
    if (error instanceof PasswordTooShort) {
      return new m.MachineError({
        path,
        status: 401,
        message: '"password" must be at least 4 characters',
        output: {
          type: "validation",
          field: "password",
          error: '"password" must be at least 4 characters',
        },
      })
    } else {
      console.error("Unexpected error: ", error)
    }
  },
})
```

### Communicate on the client

```typescript
import { create } from "mini-machines/client"
import type { routes } from "./server"

let client = create<typeof routes>({ url: "/" })
let user = await client("login", { username, password })
let profile = await client("user:profile")
```
