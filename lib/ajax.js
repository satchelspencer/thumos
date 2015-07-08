/* ajax for api calls */
define(['jquery'], function(){ 
	function complete(xhr, status, callback){
		if(xhr.status == 0 || xhr.status >= 400) callback(xhr.status); //non-client error
		else if(xhr.responseJSON.error) callback(xhr.responseJSON.error); //client error
		else callback(null, xhr.responseJSON); //no error
	}
	return {
		req : function(verb, url, stl, last){
			/* accepts either (verb, url, callback) or (verb, url, data, callback) */
			var data = last?JSON.stringify(stl):undefined;
			var callback = last?last:stl;
			$.ajax({
				type : verb,
				url : '/api'+url,
				data : data,
				contentType : 'application/json; charset=utf-8',
				complete : function(xhr, status){
					complete(xhr, status, callback);
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
});