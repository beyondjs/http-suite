import { Fetcher } from './fetcher';
import { Events } from '@beyond-js/kernel/core';

export /*bundle*/
class Api extends Events {
	#url;
	get url() {
		return this.#url ?? '';
	}
	#fetcher: Fetcher;

	get actions() {
		return this.#fetcher.actions;
	}
	get streamResponse() {
		return this.#fetcher.streamResponse;
	}

	get metadata() {
		return this.#fetcher.metadata;
	}

	get stringContent() {
		return this.#fetcher.stringContent;
	}
	constructor(url) {
		super();
		this.#url = url;
		this.#fetcher = new Fetcher();
		this.#fetcher.on('action.received', () => this.trigger('action.received'));
		this.#fetcher.on('stream.response', this.#getResponse);
	}

	#getResponse = () => {
		this.trigger('stream.response');
	};
	async action(method = 'get', route: string, specs: object = {}): Promise<any> {
		return this.#fetcher[method](this.getURL(route), specs);
	}

	getURL(route: string): string {
		return `${this.#url}${route}`;
	}

	bearer(bearer) {
		this.#fetcher.bearer(bearer);
		return this;
	}
	get(route: string, specs?: object): Promise<any> {
		return this.action('get', route, specs);
	}

	post(route: string, specs: object): Promise<any> {
		return this.action('post', route, specs);
	}
	put(route: string, specs: object): Promise<any> {
		return this.action('put', route, specs);
	}
	delete(route: string, specs?: object): Promise<any> {
		return this.action('delete', route, specs);
	}

	stream(route: string, specs: object = {}): Promise<any> {
		return this.action('stream', route, specs);
	}
}
