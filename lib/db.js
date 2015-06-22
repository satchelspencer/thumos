var mongo = require('mongojs');

module.exports = function(connection){
	var db = mongo(connection);
	return {
		/* proxy to original object */
		collection : function(collection){
			return db.collection(collection);
		},
		id : function(str){
			return mongo.ObjectId(str); //convert string to object id
		},
		str : function(id){
			return id+""; //convert object id to string
		}
	}
};
