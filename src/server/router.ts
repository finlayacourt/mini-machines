import { CookieSerializeOptions, parse, serialize } from "cookie"
import { IncomingMessage, ServerResponse } from "http"
import { MachineError } from "../errors"

interface Cookies {
	get(name: string): string | undefined
	set(name: string, value: string, options?: CookieSerializeOptions): void
	delete(name: string): void
}

interface Machine<Context, Input, Output> {
	type: "machine"
	input?: (raw: unknown) => Input
	resolve: (params: {
		input: Input
		context: Context
		cookies: Cookies
	}) => Promise<Output> | Output
}

export interface Router<Context, Paths extends [string, any, any]> {
	type: "router"
	run: (
		path: string,
		input: unknown,
		context: Context,
		cookies: Cookies,
	) => Promise<Paths[2] | undefined>
}

type RoutesToRouter<Context, Routes> = Router<
	Context,
	{
		[Key in keyof Routes & string]: Routes[Key] extends Router<any, infer Paths>
			? Paths extends any
				? [`${Key}:${Paths[0]}`, Paths[1], Paths[2]]
				: never
			: Routes[Key] extends Machine<any, infer Input, infer Output>
			? [Key, Input, Output]
			: never
	}[keyof Routes & string]
>

export function router<
	Context,
	Routes extends Record<string, Machine<Context, any, any> | Router<Context, [string, any, any]>>,
>(routes: Routes): RoutesToRouter<Context, Routes> {
	return {
		type: "router",
		async run(path, input, context, cookies) {
			let [first, next] = path.split(/:(.*)/s)
			let entry = routes[first!]
			if (entry === undefined) {
				throw new MachineError({
					path,
					status: 404,
					message: `Function ${path} not found`,
				})
			}
			if (entry.type === "router") {
				if (next === undefined) {
					throw new MachineError({
						path,
						status: 404,
						message: `Function ${path} not found`,
					})
				}
				return await entry.run(next, input, context, cookies)
			} else {
				if (entry.input) entry.input(input)
				return await entry.resolve({ input, context, cookies })
			}
		},
	}
}

export function context<ContextIn, ContextOut>(
	handle: (params: { context: ContextIn; cookies: Cookies }) => Promise<ContextOut> | ContextOut,
) {
	return {
		router<
			Routes extends Record<
				string,
				Machine<ContextOut, any, any> | Router<ContextOut, [string, any, any]>
			>,
		>(routes: Routes): RoutesToRouter<ContextIn, Routes> {
			let child = router<ContextOut, Routes>(routes)
			return {
				type: "router",
				run: async (path, input, context, cookies) =>
					child.run(path, input, await handle({ context, cookies }), cookies),
			}
		},
	}
}

export function machine<Context, Input, Output>(params: {
	input?: (raw: unknown) => Input
	resolve: (params: {
		input: Input
		context: Context
		cookies: Cookies
	}) => Promise<Output> | Output
}): Machine<Context, Input, Output> {
	return {
		type: "machine",
		input: params.input,
		resolve: params.resolve,
	}
}

export function create({
	router,
	prefix = "/",
	on_error = () => undefined,
}: {
	router: Router<any, [string, any, any]>
	prefix?: string
	on_error?: (params: { path: string; error: unknown; cookies: Cookies }) => MachineError | void
}) {
	return async function (req: IncomingMessage, res: ServerResponse) {
		if (req.url === undefined || req.url.substring(0, prefix.length) !== prefix) {
			throw new Error(`Unexpected url: ${req.url}`)
		}
		let path = req.url.substring(prefix.length + 1)

		let set_cookie: string[] = []
		let cookie = req.headers.cookie ? parse(req.headers.cookie) : undefined
		let cookies: Cookies = {
			get(name) {
				return cookie ? cookie[name] : undefined
			},
			set(name, value, options) {
				set_cookie.push(serialize(name, value, { httpOnly: true, secure: true, ...options }))
			},
			delete(name) {
				set_cookie.push(serialize(name, "", { httpOnly: true, secure: true, expires: new Date(0) }))
			},
		}

		let buffers = []
		for await (const chunk of req) {
			buffers.push(chunk)
		}
		let text = Buffer.concat(buffers).toString()
		let input = text === "" ? undefined : JSON.parse(text)

		let body: any
		try {
			let output = await router.run(path, input, {}, cookies)
			body = { output }
		} catch (caught) {
			let error =
				on_error({
					path,
					error: caught,
					cookies,
				}) ||
				new MachineError({
					path,
					status: 500,
					message: "Unknown server error",
					output: undefined,
				})
			res.statusCode = error.status
			body = {
				error: {
					message: error.message,
					output: error.output,
				},
			}
		} finally {
			res.setHeader("set-cookie", set_cookie)
			res.setHeader("content-type", "application/json")
			res.end(body)
		}
	}
}
