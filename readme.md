# thumos
models and views that build express routes on the server and compile on the client. **one code fits all**

## thumos.config(options)
setup a new thumos build given options:
  - `buildpath` **path**: destination for the build files (should be accessible by static webserver)
  - `uglify` (optional) **boolean**: controls minification of source files
  - `models` **array**: of paths to thumos models
  - `pages` **array**: of objects specifying build pages:
    - `title` **string**: title for page
    - `view` **path**: of thumos view modules
    - `url` **path**: of page destination relative to website root
  - `paths` (optional) **object**: see http://requirejs.org/docs/api.html#config-paths
  - `ext` (optional) **object**: paths for external libraries (not to be included in build)
  - `shim` (optional) **object**: see http://requirejs.org/docs/api.html#config-shim
  - `html` (optional) **path**: to default html template to build pages from
  - `express` **express app**: express app to build model routes on
  
example setup:
~~~
- app
 - main.js
 - models
  - things.js
 - views
  - home
 - ext
  - jquery-cookie.js
 - build
~~~

main.js
~~~ javascript
var express = require('express');
var thumos = require('thumos');

var app = express();

thumos.config({
  buildpath : 'build',
  uglify : false,
	models : [
		'models/things',
	],
	pages : [
		{
			title : 'My Thing',
			view : 'views/home',
			url : '/'
		}
	],
	ext : {
		'jquery' : 'https://code.jquery.com/jquery-1.11.1.min'
	},
	shim : {
		'ext/jquery-cookie' : {
    		deps : ['jquery'],
    		exports : 'jQuery.fn.cookie'
    	}
	},
	express : app
});
~~~

## thumos.model(options)
todo

## thumos.view(options)
todo
