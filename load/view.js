define({
    normalize : function(path){ /* not used, for now */
        var p = nodeRequire('path');
        return path.match("\.js$")?path:p.join(path, p.basename(path)+'.js');
    },
	init : browser(function(config){
		var $ = require('jquery');
        var _ = require('underscore');
		
		return function(options){
			var d = _.isString(config.html)?$(config.html):config.html(); //build our jquery clone w/data and events!!!
			var dom = d.clone(true);
			/* now initalize our view since its children are done */
			if(config.init) config.init.apply(dom, [dom, options].concat(_.rest(arguments)));
			return dom;
		}
	})
});