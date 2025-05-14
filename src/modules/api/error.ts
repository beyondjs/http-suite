export class ApiError extends Error {
	constructor(message: string, public cause?: unknown) {
		super(message);
		this.name = 'ApiError';
	}
}
