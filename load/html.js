define({
    transform : function(text, path, callback){
        var htmlMinify = nodeRequire('html-minifier');
        var crypto = nodeRequire('crypto');
        var unserscore = require('underscore');
        
        var html = htmlMinify.minify(text, {
		  collapseWhitespace : true,
		  removeComments : true,
		  removeAttributeQuotes : true,
		  removeOptionalTags : true
        });
        
        var templates = [];
        var ids = [];
                        
        html = html.replace(/<%[\s]*([\S]+)[\s]*[\|]*[\s]*([\S]*)[\s]*%>/g, function(match, tag, className){
            templates.push(tag);
            var id = crypto.randomBytes(8).toString('hex');
            ids.push({
                id : id,
                class : className
            });
            return '<div id="'+id+'"></div>';
        });
                
		callback(null, 'define(function(){\
            var dom = $('+JSON.stringify(html)+');\
            var templates = ['+_.map(templates, function(template, i){
                return '[require("'+template+'"),"'+ids[i].id+'","'+ids[i].class+'"],';
            })+'];\
            _.each(templates, function(template){dom.find("#"+template[1]).replaceWith(template[0]().render().addClass(template[2]))});\
            return dom;\
        })');
	}
})