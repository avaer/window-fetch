
/**
 * request.js
 *
 * Request class contains server only options
 */

import Headers from './headers.js';
import Body, { clone, extractContentType, getTotalBytes } from './body';

const { format: format_url, parse: parse_url } = require('url');

const PARSED_URL = Symbol('url');

/**
 * Request class
 *
 * @param   Mixed   input  Url or Request instance
 * @param   Object  init   Custom options
 * @return  Void
 */
export default class Request {
  constructor(input, init = {}) {
    let parsedURL;

    // normalize input
    if (!(input instanceof Request)) {
      if (input && input.href) {
        // in order to support Node.js' Url objects; though WHATWG's URL objects
        // will fall into this branch also (since their `toString()` will return
        // `href` property anyway)
        parsedURL = parse_url(input.href);
      } else {
        // coerce input to a string before attempting to parse
        parsedURL = parse_url(`${input}`);
      }
      input = {};
    } else {
      parsedURL = parse_url(input.url);
    }
    parsedURL = (() => {
      const result = {};
      for (const k in parsedURL) {
        result[k] = parsedURL[k];
      }
      return result;
    })();

    let method = init.method || input.method || 'GET';

    if ((init.body != null || input instanceof Request && input.body !== null) &&
      (method === 'GET' || method === 'HEAD')) {
      throw new TypeError('Request with GET/HEAD method cannot have body');
    }

    let inputBody = init.body != null ?
      init.body :
      input instanceof Request && input.body !== null ?
        clone(input) :
        null;

    Body.call(this, inputBody, {
      timeout: init.timeout || input.timeout || 0,
      size: init.size || input.size || 0
    });

    // fetch spec options
    this.method = method.toUpperCase();
    this.redirect = init.redirect || input.redirect || 'follow';
    this.headers = new Headers(init.headers || input.headers || {});

    if (init.body != null) {
      const contentType = extractContentType(this);
      if (contentType !== null && !this.headers.has('Content-Type')) {
        this.headers.append('Content-Type', contentType);
      }
    }

    // server only options
    this.follow = init.follow !== undefined ?
      init.follow : input.follow !== undefined ?
      input.follow : 20;
    this.compress = init.compress !== undefined ?
      init.compress : input.compress !== undefined ?
      input.compress : true;
    this.counter = init.counter || input.counter || 0;
    this.agent = init.agent || input.agent;

    this[PARSED_URL] = parsedURL;
    Object.defineProperty(this, Symbol.toStringTag, {
      value: 'Request',
      writable: false,
      enumerable: false,
      configurable: true
    });
  }

  get url() {
    return format_url(this[PARSED_URL]);
  }

  /**
   * Clone this request
   *
   * @return  Request
   */
  clone() {
    return new Request(this);
  }
}

Body.mixIn(Request.prototype);

Object.defineProperty(Request.prototype, Symbol.toStringTag, {
  value: 'RequestPrototype',
  writable: false,
  enumerable: false,
  configurable: true
});

export function getNodeRequestOptions(request) {
  const parsedURL = request[PARSED_URL];
  const headers = new Headers(request.headers);

  // fetch step 3
  if (!headers.has('Accept')) {
    headers.set('Accept', '*/*');
  }

  // Basic fetch
  if (!parsedURL.protocol || !parsedURL.hostname) {
    throw new TypeError('Only absolute URLs are supported');
  }

  if (!/^https?:$/.test(parsedURL.protocol)) {
    throw new TypeError('Only HTTP(S) protocols are supported');
  }

  // HTTP-network-or-cache fetch steps 5-9
  let contentLengthValue = null;
  if (request.body == null && /^(POST|PUT)$/i.test(request.method)) {
    contentLengthValue = '0';
  }
  if (request.body != null) {
    const totalBytes = getTotalBytes(request);
    if (typeof totalBytes === 'number') {
      contentLengthValue = String(totalBytes);
    }
  }
  if (contentLengthValue) {
    headers.set('Content-Length', contentLengthValue);
  }

  // HTTP-network-or-cache fetch step 12
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)');
  }

  // HTTP-network-or-cache fetch step 16
  if (request.compress) {
    headers.set('Accept-Encoding', 'gzip,deflate');
  }
  if (!headers.has('Connection') && !request.agent) {
    headers.set('Connection', 'close');
  }

  // HTTP-network fetch step 4
  // chunked encoding is handled by Node.js

  return Object.assign({}, parsedURL, {
    method: request.method,
    headers: headers.raw(),
    agent: request.agent
  });
}
