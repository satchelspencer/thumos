define({
	transform : function(csstext, path, callback){
		nodeRequire('less').render(csstext, function (e, css) {
			if(e) callback(e);
			else nodeRequire('postcss')([nodeRequire('autoprefixer-core')]).process(css).then(function(res){
				var css = nodeRequire('sqwish').minify(res.css);
				callback(null, 'define((function(){var tag = document.createElement(\'style\');tag.type = \'text/css\';tag.innerHTML = '+JSON.stringify(css)+';document.getElementsByTagName(\'head\')[0].appendChild(tag);})())');
			});
		});
	}
});