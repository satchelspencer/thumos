/* ajax for api calls */
define({factory : true}, function(){ 
	var $ = require('jquery');
	var auth = require('auth');

	function complete(xhr, status, callback){
		if(xhr.status == 0 || xhr.status >= 400) callback(xhr.status); //non-client error
		else if(xhr.responseJSON.error){
			if(xhr.responseJSON.error.permission){
				auth.revoke(); //update authentication status
			}
			callback(xhr.responseJSON.error); //client error
		}else callback(null, xhr.responseJSON); //no error
	}
	var api = {
		req : function(verb, url, stl, last){
			var args = Array.prototype.slice.call(arguments, 0);
			/* accepts either (verb, url, callback) or (verb, url, data, callback) */
			var data = last?JSON.stringify(stl):undefined;
			var callback = last?last:stl;
			$.ajax({
				type : verb,
				url : '/api'+url,
				data : data,
				contentType : 'application/json; charset=utf-8',
				complete : function(xhr, status){
					complete(xhr, status, function(e, res){
						if(e&&e.permission){
							/* if we had a permission error wait until they come back and try again */
							function retry(uid){
								if(uid){
									api.req.apply(this, args);
									auth.unbind(retry);
								}
							}
							auth.bind(retry)
						}
						else callback(e, res);
					});
				}
			});
		},
		file : function(url, file, progress, callback){
			/* expects one file */
			var fd = new FormData();
			fd.append('files', file);
			$.ajax({
				xhr: function(){
		       		var x = $.ajaxSettings.xhr();
		          	if(x.upload && progress) x.upload.addEventListener('progress', function(e){
		          		progress(e.loaded/e.total);
		          	}, false);
		            return x;
		        },
				type : 'POST',
				url : '/api'+url,
				data : fd,
				processData: false,
	  			contentType: false,
				complete : function(xhr, status){
					complete(xhr, status, callback);
				}
			});
		}
	}
	return api;
});