/* Sag-JS v0.3.0 saggingcouch.com
Licensed under Apache 2.0 */
(function(exports) {
  var isArray = Array.isArray || function(arg) {
    return Object.prototype.toString.call(arg) == '[object Array]';
  };

  var parseURL;

    parseURL = function(str) {
      var res;
      var a = document.createElement('a');
      a.href = str;

      res = {
        protocol: a.protocol,
        port: a.port || '80',
        hostname: a.hostname,
        path: a.pathname
      };

      res.host = a.host || res.hostname + ':' + res.port;

      if(a.href.indexOf('@')) {
        res.auth = a.href.substr(
          res.protocol.length + 2,
          a.href.indexOf('@') - res.protocol.length - 2
        );
      }

      return res;
    };

  //auth types
  exports.AUTH_BASIC = 'AUTH_BASIC';
  exports.AUTH_COOKIE = 'AUTH_COOKIE';
exports.serverFromURL = function(url) {
  var parts;
  var sagRes;

  if(!url || typeof url !== 'string') {
    throw TypeError('You must provide a complete URL as a string.');
  }

  parts = parseURL(url);

  //create the server
  parts.host = parts.host.split(':');
  sagRes = exports.server(parts.host.shift(), parts.host.shift());

  //log the user in (if provided)
  if(parts.auth) {
    parts.auth = parts.auth.split(':');

    sagRes.login({
      user: parts.auth[0],
      pass: parts.auth[1]
    });
  }

  //set the database (if there's a path)
  if(typeof parts.path === 'string' && parts.path.length > 1) {
    sagRes.setDatabase(parts.path.split('/')[1]);
  }

  return sagRes;
};
exports.server = function(host, port, user, pass) {

// The API that server returns.
var publicThat;

/*
 * http is the node module whereas xmlHTTP is the XHR object. Also a good
 * way to detect whether you're in node or browser land.
 */
var http;
var xmlHTTP;

// If in node land this is the url module.
var urlUtils;

// Whether we should decode response bodies or not.
var decodeJSON = true;
// The current database.
var currDatabase;
// Whether ?stale=ok should be put into URLs by default or not.
var staleDefault = false;
// The cookies from setCookie() and getCookie()
var globalCookies = {};
// User supplied path prefix.
var pathPrefix = '';
// Stores the auth info: user, pass, type
var currAuth = {};

// Used by sag.on()
var observers = {
  _notify: function(k, v) {
    var i;

    if(this[k]) {
      for(i in this[k]) {
        if(this[k].hasOwnProperty(i) && typeof this[k][i] === 'function') {
          this[k][i](v);
        }
      }
    }
  },
  error: []
};

// Utility function to remove a bunch of dupe code.
function throwIfNoCurrDB() {
  if(!currDatabase) {
    throw new Error('Must setDatabase() first.');
  }
}

// Because JS can't do base 64 on its own (wtf?)
function toBase64(str) {
  //node
  if(typeof Buffer === 'function') {
    return new Buffer(str).toString('base64');
  }

  //browser
  if(typeof btoa === 'function') {
    return btoa(str);
  }

  throw new Error('No base64 encoder available.');
}

// Common interface for XHR and http[s] modules to send responses to.
function onResponse(httpCode, headers, body, callback) {
  var resp = {
    _HTTP: {
      status: httpCode
    },
    headers: headers
  };
  var i;
  var pieces;

  if(typeof body === 'string') {
    try {
      //JSON decode
      resp.body = (body.length > 0 && decodeJSON) ? JSON.parse(body) : body;
    }
    catch(e) {
      //failed to decode - likely not JSON
      resp.body = body;
    }
  }

  //will likely only happen in node due to httpOnly cookies
  if(headers['set-cookie']) {
    resp.cookies = {};

    for(i in headers['set-cookie']) {
      if(headers['set-cookie'].hasOwnProperty(i)) {
        pieces = headers['set-cookie'][i].split(';')[0].split('=');
        resp.cookies[pieces[0]] = pieces[1];
        pieces = null;
      }
    }
  }

  if(resp._HTTP.status >= 400) {
    observers._notify('error', resp);
  }

  if(typeof callback === 'function') {
    callback(resp, (resp._HTTP.status < 400));
  }
}

// The common interface for the API functions to cause a net call.
function procPacket(method, path, data, headers, callback) {
  var cookieStr = '';
  var i;
  var req;

  headers = headers || {};

  if(!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if(data && typeof data !== 'string') {
    data = JSON.stringify(data);
  }

  //deal with global cookies
  for(i in globalCookies) {
    if(globalCookies.hasOwnProperty(i)) {
      cookieStr += i + '=' + globalCookies[i] + ';';
    }
  }

  //only when we built a cookieStr above
  if(cookieStr) {
    //debug help
    if(xmlHTTP && console && typeof console.log === 'function') {
      console.log('Sending Cookie header, but do not expect any cookies in the result - CouchDB uses httpOnly cookies.');
    }

    headers.Cookie = ((headers.Cookie) ? headers.Cookie : '') + cookieStr;
  }

  if(pathPrefix) {
    path = pathPrefix + path;
  }

  //authentication
  if(currAuth.type === exports.AUTH_BASIC && (currAuth.user || currAuth.pass)) {
    headers.Authorization = 'Basic ' + toBase64(currAuth.user + ':' + currAuth.pass);
  }
  else if(currAuth.type === exports.AUTH_COOKIE) {
    if(http && typeof publicThat.getCookie('AuthSession') !== 'string') {
      throw new Error('Trying to use cookie auth, but we never got an AuthSession cookie from the server.');
    }

    headers['X-CouchDB-WWW-Authenticate'] = 'Cookie';
  }

  if(http) {
    // Node.JS http module
    headers['User-Agent'] = 'Sag-JS/0.1'; //can't set this in browsers

    req = http.request(
      {
        method: method,
        host: host,
        port: port,
        path: path,
        headers: headers
      },
      function(res) {
        var resBody;

        res.setEncoding('utf8');

        if(method !== 'HEAD') {
          resBody = '';

          res.on('data', function(chunk) {
            resBody += chunk;
          });
        }

        res.on('end', function() {
          onResponse(res.statusCode, res.headers, resBody, callback);
        });
      }
    );

    req.on('error', function(e) {
      console.log('problem with request: ' + e);
    });

    if(data) {
      req.write(data);
    }

    req.end();
  }
  else if(xmlHTTP) {
    // Browser xhr magik
    xmlHTTP.onreadystatechange = function() {
      var headers = {};
      var rawHeaders;
      var i;

      if(this.readyState === 4 && this.status > 0) {
        rawHeaders = this.getAllResponseHeaders().split('\n');

        for(i in rawHeaders) {
          if(rawHeaders.hasOwnProperty(i)) {
            rawHeaders[i] = rawHeaders[i].split(': ');

            if(rawHeaders[i][1]) {
              headers[rawHeaders[i][0].toLowerCase()] = rawHeaders[i][1].trim();
            }
          }
        }

        onResponse(
          this.status,
          headers,
          (method !== 'HEAD') ? this.response : null,
          callback
        );
      }
    };

    xmlHTTP.open(method, 'http://' + host + ':' + port + path);

    for(i in headers) {
      if(headers.hasOwnProperty(i)) {
        xmlHTTP.setRequestHeader(i, headers[i]);
      }
    }

    xmlHTTP.send(data || null);
  }
  else {
    throw new Error('coder fail');
  }
}

// Adds a query param to a URL.
function setURLParameter(url, key, value) {
  if(typeof url !== 'string') {
    throw new Error('URLs must be a string');
  }

  if(urlUtils) {
    //node.js
    url = urlUtils.parse(url);

    url.search = ((url.search) ? url.search + '&' : '?') + key + '=' + value;

    url = urlUtils.format(url);
  }
  else {
    //browser
    url = url.split('?');

    url[1] = ((url[1]) ? url[1] + '&' : '') + key + '=' + value;

    url = url.join('?');
  }

  return url;
}

//defaults
host = host || 'localhost';
port = port || '5984';

//environment and http engine detection
if(typeof XMLHttpRequest === 'function') {
  xmlHTTP = new XMLHttpRequest();
}
else if(typeof ActiveXObject === 'function') {
  xmlHTTP = new ActiveXObject('Microsoft.XMLHTTP');
}
else if(typeof require === 'function') {
  http = require('http');
  urlUtils = require('url');
}
else {
  throw new Error('whoops');
}
publicThat = {
  get: function(opts) {
    throwIfNoCurrDB();

    if(typeof opts !== 'object') {
      throw new Error('invalid opts object');
    }

    if(typeof opts.url !== 'string') {
      throw new Error('invalid url type');
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('invalid callback type');
    }

    if(opts.url.substr(0, 1) !== '/') {
      opts.url = '/' + opts.url;
    }

    if(staleDefault) {
      opts.url = setURLParameter(opts.url, 'stale', 'ok');
    }

    procPacket(
      'GET',
      '/' + currDatabase + opts.url,
      null,
      null,
      opts.callback
    );
  },

  post: function(opts) {
    var path;

    throwIfNoCurrDB();

    if(typeof opts !== 'object') {
      throw new Error('invalid opts object');
    }

    if(opts.data === null || opts.data === undefined) {
      throw new Error('you must specify data to POST');
    }

    path = '/' + currDatabase;

    if(opts.url) {
      if(typeof opts.url !== 'string') {
        throw new Error('Invalid url type (must be a string).');
      }

      if(opts.url.substr(0, 1) !== '/') {
        path += '/';
      }

      path += opts.url;
    }

    procPacket('POST', path, opts.data, null, opts.callback);
  },

  decode: function(d) {
    decodeJSON = !! d;
    return publicThat;
  },

  setDatabase: function(db, createIfNotFound, createCallback) {
    if(typeof db !== 'string' || db.length <= 0) {
      throw new Error('invalid database name');
    }

    if(createCallback) {
      if(!createIfNotFound) {
        throw new Error('Provided a callback but told not to check if the database exists.');
      }

      if(typeof createCallback !== 'function') {
        throw new Error('Invalid callback type.');
      }

      procPacket('GET', '/' + db, null, null, function(resp) {
        if(resp._HTTP.status === 404) {
          //create the db
          publicThat.createDatabase(db, function(resp) {
            //can't rely on resp.body.ok because decode might be false
            createCallback((resp._HTTP.status === 201));
          });
        }
        else if(resp._HTTP.status < 400) {
          //db was created
          createCallback(true);
        }
        else {
          //unexpected response
          createCallback(false);
        }
      });
    }

    currDatabase = db;

    return publicThat;
  },

  currentDatabase: function() {
    return currDatabase;
  },

  getAllDatabases: function(callback) {
    procPacket('GET', '/_all_dbs', null, null, callback);
  },

  getStats: function(callback) {
    throwIfNoCurrDB();

    if(typeof callback !== 'function') {
      throw new Error('Invalid callback.');
    }

    procPacket('GET', '/_stats', null, null, callback);
  },

  generateIDs: function(opts) {
    var url = '/_uuids';

    if(typeof opts !== 'object') {
      throw new Error('Missing required opts.');
    }

    if(typeof opts.count === 'number') {
      url += '?count=' + opts.count;
    }
    else if(typeof opts.count !== 'undefined') {
      throw new Error('Invalid count type');
    }

    procPacket('GET', url, null, null, opts.callback);
  },

  put: function(opts) {
    if(typeof opts !== 'object') {
      throw new Error('Missing required opts.');
    }

    throwIfNoCurrDB();

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback');
    }

    if(!opts.id) {
      throw new Error('Must specify an id.');
    }

    if(typeof opts.id !== 'string') {
      throw new Error('Invalid id type (must be a string).');
    }

    if(!opts.data) {
      throw new Error('Invalid data: must specify data (a document) to PUT.');
    }
    else {
      if(!opts.data._id) {
        throw new Error('No _id specified in the data.');
      }

      if(typeof opts.data._id !== 'string') {
        throw new Error('Invalid _id specific (must be a string).');
      }

      if(typeof opts.data === 'object' || isArray(opts.data)) {
        opts.data = JSON.stringify(opts.data);
      }
      else if(typeof opts.data !== 'string') {
        throw new Error('Invalid data: must be a string of JSON or an object or array to be encoded as JSON.');
      }
    }

    procPacket(
      'PUT',
      '/' + currDatabase + '/' + opts.id,
      opts.data,
      null,
      opts.callback
    );
  },

  delete: function(id, rev, callback) {
    throwIfNoCurrDB();

    if(!id || typeof id !== 'string') {
      throw new Error('Invalid id');
    }

    if(!rev || typeof rev !== 'string') {
      throw new Error('Invalid rev');
    }

    if(callback && typeof callback !== 'function') {
      throw new Error('Invalid callback type');
    }

    procPacket(
      'DELETE',
      '/' + currDatabase + '/' + id,
      null,
      { 'If-Match': rev },
      callback
    );

    return publicThat;
  },

  head: function(opts) {
    if(typeof opts !== 'object') {
      throw new Error('Missing required opts.');
    }

    throwIfNoCurrDB();

    if(typeof opts.url !== 'string' || !opts.url) {
      throw new Error('Invalid URL provided');
    }

    if(opts.url.substr(0, 1) !== '/') {
      opts.url = '/' + opts.url;
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback type');
    }

    procPacket(
      'HEAD',
      '/' + currDatabase + opts.url,
      null,
      null,
      opts.callback
    );

    return publicThat;
  },

  getSession: function(callback) {
    if(callback && typeof callback !== 'function') {
      throw new Error('Invalid callback type');
    }

    procPacket('GET', '/_session', null, null, callback);
  },

  bulk: function(opts) {
    var data = {};

    if(typeof opts !== 'object') {
      throw new Error('Missing required opts.');
    }

    throwIfNoCurrDB();

    if(!opts.docs || !isArray(opts.docs)) {
      throw new Error('Invalid docs provided.');
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback type');
    }

    if(opts.allOrNothing) {
      data.all_or_nothing = !!opts.allOrNothing;
    }

    data.docs = opts.docs;

    procPacket(
      'POST',
      '/' + currDatabase + '/_bulk_docs',
      data,
      null,
      opts.callback
    );
  },

  compact: function(opts) {
    var url;

    if(typeof opts !== 'object') {
      throw new Error('Missing required opts.');
    }

    throwIfNoCurrDB();

    url = '/' + currDatabase + '/_compact';

    if(opts.viewName) {
      if(typeof opts.viewName !== 'string') {
        throw new Error('Invalid viewName provided.');
      }

      url += '/' + opts.viewName;
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback type.');
    }

    procPacket('POST', url, null, null, opts.callback);
  },

  copy: function(opts) {
    if(typeof opts !== 'object') {
      throw new Error('Missing required opts.');
    }

    throwIfNoCurrDB();

    if(!opts.srcID || typeof opts.srcID !== 'string') {
      throw new Error('Invalid srcID.');
    }

    if(!opts.dstID || typeof opts.dstID !== 'string') {
      throw new Error('Invalid dstID.');
    }

    if(opts.dstRev) {
      if(typeof opts.dstRev !== 'string') {
        throw new Error('Invalid dstRev.');
      }

      opts.dstID += '?rev=' + opts.dstRev;
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback type.');
    }

    procPacket(
      'COPY',
      '/' + currDatabase + '/' + opts.srcID,
      null,
      { Destination: opts.dstID },
      opts.callback
    );
  },

  setStaleDefault: function(isIt) {
    staleDefault = !!isIt;

    return publicThat;
  },

  createDatabase: function(name, callback) {
    if(!name || typeof name !== 'string') {
      throw new Error('Invalid database name.');
    }

    if(callback && typeof callback !== 'function') {
      throw new Error('Invalid callback type.');
    }

    procPacket('PUT', '/' + name, null, null, callback);
  },

  deleteDatabase: function(name, callback) {
    if(!name || typeof name !== 'string') {
      throw new Error('Invalid database name.');
    }

    if(callback && typeof callback !== 'function') {
      throw new Error('Invalid callback type.');
    }

    procPacket('DELETE', '/' + name, null, null, callback);
  },

  setAttachment: function(opts) {
    var url;

    throwIfNoCurrDB();

    if(!opts.name || typeof opts.name !== 'string') {
      throw new Error('Invalid attachment name.');
    }

    if(!opts.data || typeof opts.data !== 'string') {
      throw new Error('Invalid attachment data - remember to serialize it to a string!');
    }

    if(!opts.contentType || typeof opts.contentType !== 'string') {
      throw new Error('Invalid contentType.');
    }

    if(!opts.docID || typeof opts.docID !== 'string') {
      throw new Error('Invalid docID.');
    }

    if(opts.docRev && typeof opts.docRev !== 'string') {
      throw new Error('Invalid attachment docRev.');
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback type.');
    }

    url = '/' + currDatabase + '/' + opts.docID + '/' + opts.name;

    if(opts.docRev) {
      url += '?rev=' + opts.docRev;
    }

    procPacket(
      'PUT',
      url,
      opts.data,
      { 'Content-Type': opts.contentType },
      opts.callback
    );
  },

  setCookie: function(key, value) {
    if(!key || typeof key !== 'string') {
      throw new Error('Invalid cookie key.');
    }

    if(value !== null && typeof value !== 'string') {
      throw new Error('Invalid non-string and non-null cookie value.');
    }

    if(value === null) {
      delete globalCookies[key];
    }
    else {
      globalCookies[key] = value;
    }

    return publicThat;
  },

  getCookie: function(key) {
    if(!key || typeof key !== 'string') {
      throw new Error('Invalid cookie key.');
    }

    return globalCookies[key];
  },

  replicate: function(opts) {
    var data = {};

    if(typeof opts !== 'object') {
      throw new Error('Invalid parameter.');
    }

    if(!opts.source || typeof opts.source !== 'string') {
      throw new Error('Invalid source.');
    }

    if(!opts.target || typeof opts.target !== 'string') {
      throw new Error('Invalid target');
    }

    if(opts.filter && typeof opts.filter !== 'string') {
      throw new Error('Invalid filter.');
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback type.');
    }

    if(opts.filterQueryParams) {
      if(typeof opts.filterQueryParams !== 'object') {
        throw new Error('Invalid filterQueryParams.');
      }

      if(!opts.filter) {
        throw new Error('Provided filterQueryParams but no filter.');
      }
    }

    data.source = opts.source;
    data.target = opts.target;

    if(opts.continuous) {
      data.continuous = !!opts.continuous;
    }

    if(opts.createTarget) {
      data.create_target = !!opts.createTarget;
    }

    if(opts.filter) {
      data.filter = opts.filter;

      if(opts.filterQueryParams) {
        data.filterQueryParams = opts.filterQueryParams;
      }
    }

    procPacket('POST', '/_replicate', data, null, opts.callback);
  },

  getAllDocs: function(opts) {
    var url;
    var qry = [];

    if(typeof opts !== 'object') {
      throw new Error('Invalid parameter.');
    }

    if(opts.includeDocs) {
      qry.push('include_docs=true');
    }

    if(opts.limit) {
      if(typeof opts.limit !== 'number') {
        throw new Error('Invalid limit.');
      }

      qry.push('limit=' + opts.limit);
    }

    if(opts.startKey) {
      if(typeof opts.startKey !== 'string') {
        throw new Error('Invalid startKey.');
      }

      qry.push('startkey=' + encodeURIComponent(opts.startKey));
    }

    if(opts.endKey) {
      if(typeof opts.endKey !== 'string') {
        throw new Error('Invalid endKey.');
      }

      qry.push('endkey=' + encodeURIComponent(opts.endKey));
    }

    if(opts.descending) {
      qry.push('descending=true');
    }

    qry = '?' + qry.join('&');

    url = '/' + currDatabase + '/_all_docs' + qry;

    if(opts.keys) {
      if(!isArray(opts.keys)) {
        throw new Error('Invalid keys (not an array).');
      }

      procPacket('POST', url, { keys: opts.keys }, null, opts.callback);
    }

    procPacket('GET', url, null, null, opts.callback);
  },

  setPathPrefix: function(pre) {
    if(pre !== undefined && pre !== null && typeof pre !== 'string') {
      throw new Error('Invalid path prefix.');
    }

    //no trailing slash
    if(pre.substr(pre.length - 1, 1) == '/') {
      pre = pre.substr(0, pre.length - 1);
    }

    pathPrefix = pre || '';

    return publicThat;
  },

  login: function(opts) {
    if(typeof opts !== 'object') {
      throw new Error('Invalid options object.');
    }

    if(opts.callback && typeof opts.callback !== 'function') {
      throw new Error('Invalid callback.');
    }

    if(opts.user && typeof opts.user !== 'string') {
      throw new Error('Invalid user.');
    }

    if(opts.pass && typeof opts.pass !== 'string') {
      throw new Error('Invalid pass.');
    }

    if(opts.type && typeof opts.type !== 'string') {
      throw new Error('Invalid type of auth - use AUTH_BASIC or AUTH_COOKIE.');
    }

    if(!opts.type || opts.type === exports.AUTH_BASIC) {
      currAuth.type = exports.AUTH_BASIC;
      currAuth.user = opts.user;
      currAuth.pass = opts.pass;

      if(opts.callback) {
        opts.callback(publicThat);
      }
      else {
        return publicThat;
      }
    }
    else if(opts.type === exports.AUTH_COOKIE) {
      //TODO url encode
      procPacket(
        'POST',
        '/_session',
        'name=' + opts.user + '&password=' + opts.pass,
        {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        function(resp) {
          if(resp.cookies && resp.cookies.AuthSession) {
            publicThat.setCookie(
              'AuthSession',
              resp.cookies.AuthSession
            );

            currAuth.type = opts.type;
          }

          if(opts.callback) {
            opts.callback(publicThat);
          }
        }
      );

      if(!opts.callback) {
        return publicThat;
      }
    }
    else {
      throw new Error('Unknown auth type.');
    }
  },

  on: function(flag, callback) {
    if(observers[flag]) {
      observers[flag].push(callback);
    }
    else {
      throw new Error('Invalid event name.');
    }

    return publicThat;
  },

  toString: function() {
    var str = 'http://';

    if(currAuth && currAuth.user) {
      str += currAuth.user + ':' + (currAuth.pass || '') + '@';
    }

    str += host;

    if(port) {
      str += ':' + port;
    }

    if(currDatabase) {
      str += '/' + currDatabase;
    }

    return str;
  }
};
return publicThat;
};
})((typeof exports === 'object') ? exports : (this.sag = {}));
