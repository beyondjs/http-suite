import { PendingPromise } from '@beyond-js/kernel/core';
import { IResponse } from './types';
import { ApiError } from './error';

type Metadata = { value: object | undefined; error?: string } | undefined;
type StreamData = { started: boolean; value: string; parsed: Metadata };

export class Stream {
	#SEPARATORS = {
		METADATA: 'ÿ',
		START: '😸',
		END: '🖋️',
	};

	#metadata: StreamData = {
		started: false,
		value: '',
		parsed: { value: void 0 },
	};
	get metadata(): Metadata {
		return this.#metadata.parsed;
	}

	#actions: string[] = [];
	get actions() {
		return this.#actions;
	}

	#response: string = '';
	get response() {
		return this.#response;
	}

	#executingPromise: PendingPromise<IResponse<any>> | undefined;
	#parent;
	#currentTool = { started: false, value: '', parsed: { value: void 0 } };

	constructor(parent) {
		this.#parent = parent;
	}

	get stringContent() {
		const { START, END } = this.#SEPARATORS;
		if (!this.#response) return;
		const regex = new RegExp(`${START}.*?${END}`, 'gs');
		return this.#response.replace(regex, '').trim();
	}

	clean() {
		this.#metadata = {
			started: false,
			value: '',
			parsed: { value: void 0 },
		};
		this.#actions = [];
		this.#response = '';
		this.#executingPromise = undefined;
	}

	#processResponse = (promise: PendingPromise<IResponse<any>>) => {
		const metadata = this.#metadata;
		try {
			this.#metadata.parsed.value = JSON.parse(metadata.value);
		} catch (exc) {
			this.#metadata.parsed.error = 'Error parsing metadata';
			promise?.reject(new ApiError('Failed to parse metadata', exc));
			return;
		}

		promise?.resolve({
			value: this.#response,
			...metadata.parsed.value,
		});

		this.#metadata = {
			started: false,
			value: '',
			parsed: { value: void 0 },
		};
		this.#response = undefined;
		this.#executingPromise = undefined;
	};

	#cleanCurrentTool() {
		this.#currentTool = { started: false, value: '', parsed: { value: void 0 } };
	}

	async #handleMetadata(chunk: string, response: string): Promise<string> {
		this.#metadata.started = true;
		const split = chunk.split(this.#SEPARATORS.METADATA);
		this.#metadata.value += split[1];
		return split[0] ? split[0] : '';
	}

	handleStart(chunk: string, response: string): string {
		const splitted = chunk.split(this.#SEPARATORS.START);
		this.#currentTool.started = true;
		chunk = '';

		if (splitted[1].includes(this.#SEPARATORS.END)) {
			const splitted2 = splitted[1].split(this.#SEPARATORS.END);
			this.#currentTool.value = splitted2[0];
			this.#actions.push(splitted2[0]);
			response += this.#SEPARATORS.START + this.#currentTool.value + this.#SEPARATORS.END;
		} else {
			response += splitted[0];
			this.#currentTool.value += splitted[1];
		}
		return response;
	}

	handleEnd(chunk: string, response: string): string {
		const splitted = chunk.split(this.#SEPARATORS.END);
		this.#currentTool.value += splitted[0];
		this.#currentTool.started = false;
		this.#actions.push(this.#currentTool.value);
		this.#response += this.#SEPARATORS.START + this.#currentTool.value + this.#SEPARATORS.END;
		return splitted[1];
	}

	async #read<T>(response: Response, promise: PendingPromise<IResponse<T>>) {
		const reader = response.body?.getReader();
		if (!reader) {
			promise.reject(new ApiError('Response body is not readable'));
			return;
		}

		try {
			// throw new Error('test 2');
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					this.#processResponse(promise);
					return;
				}
				if (!value) continue;

				let chunk = new TextDecoder().decode(value);

				if (chunk.includes(this.#SEPARATORS.METADATA)) {
					const cleaned = await this.#handleMetadata(chunk, this.#response);
					this.#response += cleaned;
					this.#parent.triggerEvent('stream.response');
					continue;
				}

				if (this.#metadata.started) {
					this.#metadata.value += chunk;
					this.#parent.trigger('stream.response');
					this.#parent.trigger('action.received', this.#metadata.value);
					continue;
				}

				if (chunk.includes(this.#SEPARATORS.START)) {
					this.handleStart(chunk, this.#response);
				} else if (this.#currentTool.started && chunk.includes(this.#SEPARATORS.END)) {
					this.handleEnd(chunk, this.#response);
					this.#cleanCurrentTool();
				}

				this.#response += chunk;
				this.#parent.triggerEvent('action.received');
				this.#parent.triggerEvent('stream.response');
			}
		} catch (e) {
			promise.reject(new ApiError('Stream reading failed', e));
		}
	}

	async execute<T>(url: string, specs: RequestInit): Promise<IResponse<T>> {
		this.#executingPromise = new PendingPromise<IResponse<T>>();
		this.#response = '';

		let response: Response;
		try {
			response = await fetch(url, specs);

			if (!response.ok) {
				throw new ApiError(`Stream request failed with status ${response.status}`);
			}

			await this.#read(response, this.#executingPromise);
		} catch (e) {
			console.error('Stream execution failed', e);
			this.#executingPromise.reject(new ApiError('Stream execution failed', e));
		}

		return this.#executingPromise;
	}
}
