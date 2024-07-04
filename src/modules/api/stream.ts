import { PendingPromise } from '@beyond-js/kernel/core';
import { IResponse } from './types';

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

	#processResponse = promise => {
		const metadata = this.#metadata;
		try {
			this.#metadata.parsed.value = JSON.parse(metadata.value);
		} catch (exc) {
			console.log(metadata);
			console.error(exc);
			this.#metadata.parsed.error = 'Error parsing metadata';
		}

		promise.resolve({
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
		return split[0] ? (response += split[0]) : response;
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

	async #read<T>(response, promise) {
		// create the stream reader

		const reader = response.body?.getReader();
		while (true) {
			const { done, value } = await reader.read();
			let chunk = new TextDecoder().decode(value);

			if (done) return this.#processResponse(promise);

			if (chunk.includes(this.#SEPARATORS.METADATA)) {
				this.#handleMetadata(chunk, this.#response);
				continue;
			}

			if (this.#metadata.started) {
				this.#metadata.value += chunk;
				this.#parent.trigger('stream.response');
				return;
			}

			if (chunk.includes(this.#SEPARATORS.START)) {
				this.handleStart(chunk, this.#response);
			} else if (this.#currentTool.started && chunk.includes(this.#SEPARATORS.END)) {
				// ends to receive an action tool
				this.handleEnd(chunk, this.#response);
				this.#cleanCurrentTool();
			}

			this.#response += chunk;
			// console.log(44, this.#response);
			this.#parent.triggerEvent('action.received');
			this.#parent.triggerEvent('stream.response');
		}
	}

	async execute<T>(url, specs): Promise<IResponse<T>> {
		try {
			this.#executingPromise = new PendingPromise<IResponse<T>>();
			this.#response = '';
			const response: Response = await fetch(url, specs);

			if (!response.ok) {
				throw new Error('error in stream');
			}

			this.#read(response, this.#executingPromise);
			return this.#executingPromise;
		} catch (e) {
			console.error(e);
		}
	}
}
