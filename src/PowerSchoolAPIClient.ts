import axios, { AxiosRequestConfig, AxiosInstance, AxiosError } from 'axios';

/**
 * PowerSchool OAuth client that allows you to make data access
 * requests to PowerSchool server.
 */
class PowerSchoolAPIClient {
  /**
   * Client ID and client secret in one string.
   */
  private _secret: string;

  /**
   * The base URL for the PS API.
   */
  private _apiBaseURL: string;

  /**
   * Access token returned from PowerSchool's OAuth endpoint.
   */
  private _accessToken: {
    access_token: string;
    token_type: string;
    expires: string;
  };

  /**
   * A private Axios instance that'll be preconfigured with headers and base URL for
   * requests to PS API after we retrieve an access token.
   */
  private _axios?: AxiosInstance;

  /**
   * Transform any PS API response into an object
   */
  private _transformJSON(response: any) {
    return typeof response === 'string' ? JSON.parse(response) : response;
  }

  /**
   * PowerSchoolAPIClient constructor
   *
   * @param clientID OAuth client ID and client secret joined by a colon and base64-encoded
   * @param accessTokenURL The URL to our PS server's oauth access token endpoint
   * @param apiBaseURL Base URL to use in Axios instance
   * @param responseTransformers Array of response transforming functions to pass to Axios instance
   */
  constructor(options: { clientID: string; accessTokenURL: string; apiBaseURL: string; responseTransformers?: [any?] }) {
    const { clientID, accessTokenURL, apiBaseURL, responseTransformers } = options;

    this._secret = clientID;
    this._apiBaseURL = apiBaseURL;

    /* Default empty values.  Gets set later in a promise. */
    this._accessToken = {
      access_token: '',
      token_type: '',
      expires: '',
    };

    this._axios = undefined;

    /* Initial request config for getting our access token */
    const reqConfig: AxiosRequestConfig = {
      url: accessTokenURL,
      headers: {
        Authorization: `Basic ${clientID}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      data: 'grant_type=client_credentials',
    };

    /* Define our Axios response transformers */
    const transformers = responseTransformers ? [this._transformJSON].concat(responseTransformers) : [this._transformJSON];

    /* Get our access token, then set Axios instance */
    axios
      .post(accessTokenURL, reqConfig.data, reqConfig)
      .then(response => {
        /* Store access token for private reuse */
        this._accessToken = { ...response.data };

        /* Create a private Axios instance for reuse.  This instance has our access token set in
        the Authorization header so every request we make includes the access token, and the base
        URL is our base PowerSchool API URL.  It also uses the following response transformers
        so that PS API responses are a bit cleaner than they are by default. */
        this._axios = PowerSchoolAPIClient.createAxiosInstance(
          this._accessToken.access_token,
          this._apiBaseURL,
          transformers,
        );
      })
      .catch(err => {
        console.log(`Axios error: ${err.message}`);
      });
  }

  /**
   * Returns a PS-customized instance of Axios to use after obtaining access tokens.
   *
   * Uses Axios response transformers to automatically transform JSON string responses
   * received by PS API into leaner objects.
   *
   * @param accessToken Valid PowerSchool access token
   * @param baseURL Base PowerSchool API URL
   * @param responseTransformers Array of functions to add to the Axios response transformers
   */
  static createAxiosInstance(accessToken: string, baseURL: string, responseTransformers?: any[]) {
    /* Default headers on all requests */
    const headers = { Authorization: `Bearer ${accessToken}` };

    /* Array of middleware functions that can transform responses. */
    const transformResponse = responseTransformers ? Array.from(responseTransformers) : [];

    /* Return instance */
    return axios.create({ baseURL, headers, transformResponse });
  }

  /**
   * Handles an Axios error:
   *  1. Request received, but response status code was not 2xx
   *  2. Request was made, but no response was received
   *  3. Something else went wrong
   *
   * @param err An instance of an Axios error, which has custom properties: request, response, config, etc.
   * @param prepend An extra message to prepend to the final err.message.
   */
  static handleAxiosError(err: AxiosError, prepend?: string) {
    /* Handle additional message */
    if (prepend) {
      err.message = `${prepend}  ${err.message}`;
    }

    if (err.response) {
      /* Append the response status and data to err.message */
      let data = typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : err.response.data;

      // prettier-ignore
      err.message += `: ${data}.`
    } else if (err.request) {
      /* Do something with err.request? */
      err.message += `  Axios request was made, no response was received.`;
    }

    return err;
  }

  /**
   * GETs a resource using private Axios instance.
   * Returns a rejected promise if private Axios instance is not set.
   *
   * @param resource PS resource URL to GET
   * @param id Resource ID to access
   * @param options Object containing expansions and/or extensions arrays.
   *
   * From PS API docs:
   *   expansion_elements
   *     A list of elements to expand, in the form of "element1,element2,element3". For more information, see .
   *   extension_elements
   *     A list of extensions to query, in the form of "element1,element2,element3". For more information, see .
   *     There are no "standard" extensions at this time.

   * Query operators: ==, =gt=, =ge=, =lt=, =le=, ; (expr1 AND expr2 AND...), * (end of string wildcard).
   * PS API supports multiple values for a single expression by using parens: (val1, val2).
   */
  get(
    resource: string,
    id?: string | number | null,
    options?: {
      expansions?: string[];
      extensions?: string[];
      query?: string[] | string;
      pagesize?: number;
    },
  ) {
    if (this._axios) {
      /* Handle id if defined */
      if (id) {
        resource += `/${id}`;
      }

      /* Handle options object if it's defined */
      if (options) {
        resource += `?`;

        /* Expansions are additional fields/data sets that the PS API should return */
        if (options.expansions) {
          resource += `expansions=${options.expansions.toString()}&`;
        }

        /* Extensions are additional fields/data sets from PS DB Extensions that the API should return */
        if (options.extensions) {
          resource += `extensions=${options.extensions.toString()}&`;
        }

        /* Default our pagesize to 1000 */
        resource += options.pagesize ? `pagesize=${options.pagesize}&` : `pagesize=1000&`;

        /* The query is just a PS API query for searching and whatnot. */
        if (options.query) {
          resource += Array.isArray(options.query) ? `q=${options.query.join(';')}` : `q=${options.query}`;
        }
      }

      /* Return Axios request promise */
      return this._axios.get(resource);
    } else {
      return Promise.reject('Private Axios instance is not available.');
    }
  }
}

export default PowerSchoolAPIClient;
