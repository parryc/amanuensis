/************
Server setup!
*************/
var express = require('express');
var app = express(),
  http = require('http'),
  server = http.createServer(app),
  io = require('socket.io').listen(server),
  jade = require('jade'),
  passport = require('passport'),
  DigestStrategy = require('passport-http').DigestStrategy,
  mongoose = require('mongoose');


//  db = mongoose.createConnection('mongodb://localhost/haardvark');

//Reduce logging
io.set('log level',1);


//sessions and coooookie crisp
var sessionStore = new express.session.MemoryStore({reapInterval: 60000 * 10});
app.use(express.cookieParser());
app.use(express.session({
  store: sessionStore,
  key: 'sid',
  secret: 'you will never guess my secret!'
}));


app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.static('public'));
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.session({ secret: 'wodemima' }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(app.router);
});

// app.configure(function(){
//   app.set('views', __dirname + '/views');
//   app.set('view engine', 'jade');
//   app.use(express.bodyParser());
//   app.use(express.methodOverride());
//   app.use(express.session({secret: 'mima', key: 'express.sid'}));
//   app.use(require('stylus').middleware({ src: __dirname + '/public' }));
//   app.use(app.router);
//   app.use(express.static(__dirname + '/public'));
// });

app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});


//Set up Digest authentication - taken from documentation
passport.use(new DigestStrategy({ qop: 'auth' },
  function(username, done) {
    User.findOne({ username: username }, function (err, user) {
      if (err) { return done(err); }
      if (!user) { return done(null, false); }
      return done(null, user, user.password);
    });
  },
  function(params, done) {
    done(null, true);
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findOne({ _id: id }, function (err, user) {
    done(err, user);
  });
});


/********************
DEFINING THE DATABASE FOR GREAT SUCCESS!!
********************/
mongoose.connect('mongodb://localhost:27017/amanuensis', function(err){
  if (err)
    console.log("Error, Will Robinson, Error!: "+err);
});

Schema = mongoose.Schema;
ObjectId = mongoose.Types.ObjectId;


var userSchema = new Schema({
  username: String,
  password: String,
  _registrationDate: { type: Date, default: Date.now }
});

var User = mongoose.model('User',userSchema);

var entrySchema = new Schema({
  entry: String,
  meaning: String,
  source: String,
  tags: [{type: String}],
  user: { type: Schema.Types.ObjectId, ref: 'User'},
  _creationDate: { type: Date, default: Date.now }
});
var Entry = mongoose.model('Entry',entrySchema);



/********************
Application, bitches!
********************/


app.get('/', function(req, res) {
  var user = (req.user) ? req.user : undefined;
  console.log(req.user);
  res.render('index', {
      'title': 'Amanuens.is',
      'user':user
  });
});

app.get('/signup', function(req, res){
  res.render('signup', {
    title: 'Sign up',
    user: new User()
  });
});

app.post('/signup', function(req, res) {
  User.findOne({ username: req.body.username }, function (err, user) {
    if (err) { return console.log(err); }
    if (user) {
      res.render('signup', {
        message: 'That username already exists.',
        user: {}
      });
    } else {
      var newUser = new User(req.body);
      newUser.provider = 'local';
      newUser.save(function (err) {
        if (err) {
          return res.render('/', {
            errors: utils.errors(err.errors),
            user: newUser,
            title: 'Sign up'
          });
        }

        // manually login the user once successfully signed up
        req.login(newUser, function(err) {
          if(err) return console.log(err);
          return res.redirect('/');
        });
      });
    }
  });
});

app.get('/logout', function(req, res ) {
  req.logout();
  req.session.destroy(function (err) {
    res.redirect('/');
  });

  // res.redirect('/');
});


app.get('/login', function(req, res){
  res.render('login', {
    user: {username: 'Stranger'}
  });
});
app.post('/login', function(req, res ) {
  User.findOne({username: req.body.username}, function(err, user){
    req.login(user, function(err){
      if(err) return console.log(err);
      console.log(user);
      return res.redirect('/');
    });
  });
});

app.get('/add', checkAuth,
  function(req, res) {
    console.log(req.user);
    res.json(req.user);
  }
);

app.get('/:id', function(req, res) {
  res.render('index.jade', {
      'title': 'Amanuens.is - Id'
  });
});


app.get('/:id/:entryId', function(req, res) {
  res.render('index.jade', {
      'title': 'Amanuens.is - Entry'
  });
});

app.get('/:id/:entryId/edit', checkAuth,
  function(req, res) {
    res.json(req.user);
});



//SERVE THE SHIT!
if (!module.parent) {
  var port = process.env.PORT || 3000;
  server.listen(port, function() {
    console.log("Listening on " + port);
  });
}


/********
Oh, grill, look at those functions
*********/

function acceptsHtml(header) {
  var accepts = header.split(',');
  for(i=0;i<accepts.length;i+=0) {
    if (accepts[i] === 'text/html')
      return true;
  }
  return false;
}

function checkAuth(req, res, next) {
  if (!req.user || req.user.username !== req.params.id) {
    res.send('You are not authorized to view this page');
  } else {
    next();
  }
}