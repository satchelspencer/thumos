var mongo = require('mongojs');

module.exports = function(connection){
	var db = mongo(connection);
	return {
		/* proxy to original object */
		collection : function(collection){
			return db.collection(collection);
		},
		/* convert id to string and visa versa */
		id : function(str){
			if(typeof str != 'string' || !str.match(/^[0-9a-f]{24}$/)) return false; //catch invalids
			else return mongo.ObjectId(str); //convert string to object id
		},
		str : function(id){
			return id+''; //less haxorz
		}
	}
};