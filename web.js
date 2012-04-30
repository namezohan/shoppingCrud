
var express = require('express');
var fs = require('fs');
var sag =  require('sag');
var index;
var downloads = {};

var couch = sag.server('shopping.cloudant.com');
couch.setDatabase('shoppingapp');
 couch.login({
	      user: 'shopping',
	      pass: 'shoppingpass',
	      type: couch.AUTH_BASIC
	    });


var app = express.createServer(express.logger());
app.use(express.logger());
app.use(express.bodyParser());

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

// If I use app.get, it works...?
app.get('/views/*.(js|css|png|ttf|otf|html)', function(req, res){
  res.sendfile("."+req.url);
});

app.get('/', function(req, res) {
      res.writeHead(200, {'content-type': 'text/plain' });
   	  res.write("GOTO /views/index.html" );
      res.end('\n');
});

app.get('/category', function(req, res){
	   couch.get({ url: '/_design/shopping_app/_view/sub_category',
	    	  callback: function(response, success) {
		    	    if(success) {
		    	    	console.log(JSON.stringify(response.body));
		    	    	        res.writeHead(200, {'content-type': 'text/json' });
						        res.write( JSON.stringify(response.body) );
						        res.end('\n');
		    	    } else {
						console.log("could not connect Database");
		    	    }
		      }
	   });
}); 

app.get('/list', function(req, res){
		couch.get({
	    	  url: '/_design/shopping_app/_view/name_index',
	    	  callback: function(response, success) {
	    	    if(success) {
	    	    	console.log(JSON.stringify(response.body));
	    	    	 res.writeHead(200, {'content-type': 'text/json' });
					 res.write( JSON.stringify(response.body) );
					 res.end('\n');
	    	    } else {
					console.log("could not connect Database");
	    	    }
	    	  }
	   }); 
}); 
app.get('/shop/:id', function(req, res){
	couch.get({
		      url: '/'+req.params.id,
		      callback: function(response, success) {
		        if(success) {
			     	console.log(JSON.stringify(response.body));
	    	    	 res.writeHead(200, {'content-type': 'text/json' });
					 res.write( JSON.stringify(response.body) );
					 res.end('\n');
		        }
		        else {
		          console.log('Error getting blog post: HTTP ' + response._HTTP.status);
		        }
    		}
    	});
}); 
app.post('/save', function(req, res){
  console.log("POST: ");
	if(req.body._id){
		 couch.put({
			  id : req.body._id,
	          data: req.body,
	          callback: function(response, success) {
	            if(success) {
	            	 var bodyResp =  {status:'OK'};
	            	 res.writeHead(200, {'content-type': 'text/json' });
					 res.write(JSON.stringify(bodyResp));
					 res.end('\n');
	            }
	            else {
		          console.log('Error getting blog post: HTTP ' + response._HTTP.status);

	            }
	          }
		});
	}else{
		delete req.body._id;
		delete req.body._rev;
		 couch.post({
	          data: req.body,
	          callback: function(response, success) {
	            if(success) {
	            	 var bodyResp =  {status:'OK'};
	            	 res.writeHead(200, {'content-type': 'text/json' });
					 res.write(JSON.stringify(bodyResp));
					 res.end('\n');
	            }
	            else {
		          console.log('Error getting blog post: HTTP ' + response._HTTP.status);
		              
	            }
	          }
	    });
	}
}); 

var port = process.env.PORT || 5000;
app.listen(port, function() {
  console.log("Listening on " + port);
});


function NotFound(msg){
  this.name = 'NotFound';
  Error.call(this, msg);
  Error.captureStackTrace(this, arguments.callee);
}

NotFound.prototype.__proto__ = Error.prototype;

app.get('/404', function(req, res){
  throw new NotFound;
});

app.get('/500', function(req, res){
  throw new Error('keyboard cat!');
});