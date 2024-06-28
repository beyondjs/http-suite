import { ReactiveModel } from '@beyond-js/reactive/model';
import { Stream } from './stream';
import { IHeaders, IResponse } from './types';

export class Fetcher extends ReactiveModel<Fetcher> {
	private bearerToken?: string;
	private readonly streamer: Stream;
	private formDataInstance?: FormData;
	private customHeaders: IHeaders = {
		'Content-Type': 'application/json',
	};

	private defaultHeaders: IHeaders = {
		'Content-Type': 'application/json',
	};

	constructor() {
		super();
		this.streamer = new Stream(this);
	}

	get actions() {
		return this.streamer.actions;
	}

	get streamResponse() {
		return this.streamer.response;
	}

	get metadata() {
		return this.streamer.metadata;
	}
	setBearerToken(token: string | undefined): this {
		if (token) this.bearerToken = token;
		return this;
	}

	setHeaders(headers: IHeaders): this {
		this.customHeaders = { ...this.defaultHeaders, ...headers };
		return this;
	}

	private getHeaders(specs: Record<string, any>, multipart: boolean): Headers {
		const mergedHeaders = { ...this.customHeaders, ...specs };
		const headers = new Headers();
		const token = mergedHeaders.Authorization || this.bearerToken;

		if (token) {
			headers.append('Authorization', `Bearer ${token}`);
		}

		for (const [key, value] of Object.entries(mergedHeaders)) {
			if (key !== 'Authorization') {
				headers.append(key, value);
			}
		}

		if (multipart) {
			headers.delete('Content-Type');
		}

		return headers;
	}

	private createFormData(specs: Record<string, any>): FormData {
		this.formDataInstance = new FormData();
		for (const [key, value] of Object.entries(specs)) {
			this.formDataInstance.append(key, value);
		}
		return this.formDataInstance;
	}

	private processGetParams(params: Record<string, string>): URLSearchParams | string {
		if (Object.entries(params).length === 0) return '';

		const parameters = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (![NaN, undefined, ''].includes(value)) {
				parameters.append(key, value);
			}
		}

		return parameters;
	}

	private processParams(
		params: Record<string, any>,
		multipart: boolean,
		method: string,
	): FormData | string | undefined {
		if (method === 'get') {
			return this.processGetParams(params).toString();
		}

		if (Object.entries(params).length === 0) return;

		return multipart ? this.createFormData(params) : JSON.stringify(params);
	}

	private async handleResponse<T>(response: Response): Promise<IResponse<T>> {
		try {
			const data = await response.json();
			return {
				status: response.ok,
				data,
				error: !response.ok ? data.message : undefined,
				errors: !response.ok ? data.errors : undefined,
			};
		} catch (error) {
			return {
				status: false,
				error: (error as Error).message,
			};
		}
	}

	async execute<T = any>(
		url: string,
		method: string = 'get',
		params: Record<string, any> = {},
		stream: boolean = false,
	): Promise<IResponse<T>> {
		try {
			const multipart = params.multipart;
			const headers = this.getHeaders({ bearer: params.bearer }, multipart);
			delete params.multipart;
			delete params.bearer;

			const specs: RequestInit = { method, headers, mode: 'cors' };

			if (['post', 'put', 'DELETE'].includes(method)) {
				specs.body = this.processParams(params, multipart, method);
			} else if (method === 'get') {
				const queryString = this.processParams(params, multipart, method);
				if (queryString) url += `?${queryString}`;
			}

			if (stream) return this.streamer.execute(url, specs);

			const response = await fetch(url, specs);
			return this.handleResponse<T>(response);
		} catch (e) {
			return {
				status: false,
				error: 'Execution error',
			};
		}
	}

	stream<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'post', params, true);
	}

	get<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'get', params);
	}

	post<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'post', params);
	}

	delete<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'DELETE', params);
	}

	put<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'put', params);
	}
}
