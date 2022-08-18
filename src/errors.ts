export class MachineError extends Error {
	path: string
	status: number
	output: any
	constructor(params: { path: string; status: number; output?: any; message: string }) {
		super(params.message)
		this.name = "MachineError"
		this.path = params.path
		this.status = params.status
		this.output = params.output
	}
}
