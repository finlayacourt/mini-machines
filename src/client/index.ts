import { Router } from "../server/router"
import { MachineError } from "../errors"

export function create<Server extends Router<any, [string, any, any]>>(params: { url: string }) {
	type Paths = Server extends Router<any, infer Paths> ? Paths : never
	type Inputs = { [P in Paths as P[0]]: P[1] }
	type Outputs = { [P in Paths as P[0]]: P[2] }
	return async function run<Path extends Paths[0]>(
		path: Path,
		input: Inputs[Path],
	): Promise<Outputs[Path]> {
		let res = await fetch(params.url + path, {
			method: "post",
			body: JSON.stringify(input),
		})
		let data = await res.json()
		if (data.error) {
			throw new MachineError({
				path,
				status: res.status,
				message: data.error.message,
				output: data.error.output,
			})
		}
		return data.output
	}
}
