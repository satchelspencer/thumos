/* build only takes in a compat format file */
define(['container'], function(container){
	return {
		load : function(name, req, onload, config, isBuild){
			var client = typeof window != 'undefined'||config.isBuild;
			var suffix = client?'Client':'';
			req([name+suffix], function(module){
				onload(client?module:module(container.nodeRequire));
			});
		}
	}
});