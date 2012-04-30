
var express = require('express');
var fs = require('fs');
var index;
var downloads = {};


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
    res.render('root');
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