export interface IHeaders {
	'Content-Type': string;
	Authorization?: string;
}

export interface IResponse<T = any> {
	status: boolean;
	data?: T;
	error?: string;
	errors?: any[];
}