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
  LocalStrategy = require('passport-local').Strategy,
  mongoose = require('mongoose'),
  bcrypt = require('bcrypt'),
  SALT_WORK_FACTOR = 10;


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
  entries: [{ type: Schema.Types.ObjectId, ref: 'Entry'}],
  _registrationDate: { type: Date, default: Date.now }
});

//Add hashing and salting 
//From: http://danielstudds.com/setting-up-passport-js-secure-spa-part-1/
userSchema.pre('save', function(next) {
    var user = this;
 
    if(!user.isModified('password')) return next();
 
    bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
        if(err) return next(err);
 
        bcrypt.hash(user.password, salt, function(err, hash) {
            if(err) return next(err);
            user.password = hash;
            next();
        });
    });
});
 
// Password verification
userSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if(err) return cb(err);
        cb(null, isMatch);
    });
};


var User = mongoose.model('User',userSchema);

var entrySchema = new Schema({
  entry: String,
  meaning: String,
  source: String,
  slug: String,
  tags: [{type: String}],
  user: { type: Schema.Types.ObjectId, ref: 'User'},
  _creationDate: { type: Date, default: Date.now }
});
var Entry = mongoose.model('Entry',entrySchema);



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


app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});


//From http://danielstudds.com/setting-up-passport-js-secure-spa-part-1/
passport.use(new LocalStrategy(function(username, password, done) {
  User.findOne({ username: username }, function(err, user) {
    if (err) { return done(err); }
    if (!user) { return done(null, false, { message: 'Unknown user ' + username }); }
    user.comparePassword(password, function(err, isMatch) {
      if (err) return done(err);
      if(isMatch) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Invalid password' });
      }
    });
  });
}));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findOne({ _id: id }, function (err, user) {
    done(err, user);
  });
});


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
app.post('/login',
  passport.authenticate('local'),
  function(req, res) {
    res.redirect('/');
  });


app.get('/add', ensureAuthenticated,
  function(req, res) {
    res.render('add.jade', {
      'title': 'Amanuens.is - Add'
    });
  }
);
app.post('/add', ensureAuthenticated,
  function(req, res) {
    var user = req.user,
        newEntry = new Entry(req.body);

    newEntry.tags = req.body.tags.split(',').map(function(tag){return tag.trim();});
    newEntry.slug = req.body.entry.split(" ").slice(0,5).join('-')+'-'+(+new Date()).toString(36);
    newEntry.user = user;

    console.log(newEntry);

    newEntry.save(function (err) {
      if (err) {
        return res.render('/add', {
          error: utils.errors(err.errors),
          title: user.username
        });
      }

      User.findOneAndUpdate({username: user.username},{$push: {entries: newEntry}}, function(err, user){
        if(err){
          return res.render('/error');
        }

        return res.redirect('/'+user.username);

      });
    });
  }
);

app.get('/:id', function(req, res) {
  User.findOne({username: req.params.id}).populate("entries").exec(function(err, user){
    if(!user || err) {
      res.redirect('/');
    } else {
      res.render('user.jade', {
        title: 'Amanuens.is - Id',
        user: user
      });
    }
  });
});


app.get('/:id/:entryId', function(req, res) {
  User.findOne({username: req.params.id}).populate('entries').exec(function(err, user){
    Entry.findOne({slug: req.params.slug}, function(err, entry){
      res.render('entry.jade', {
        title: 'Amanuens.is - Entry',
        entry: entry,
        user: user
      });
    });
  });
});

app.get('/:id/:entryId/edit', ensureAuthenticated,
  function(req, res) {
    res.json(req.user);
});

//From stack overflowwww
// app.use(function(req, res, next){
//   res.status(404);

//   // respond with html page
//   if (req.accepts('html')) {
//     res.render('404', { url: req.url });
//     return;
//   }

//   // respond with json
//   if (req.accepts('json')) {
//     res.send({ error: 'Not found' });
//     return;
//   }

//   // default to plain-text. send()
//   res.type('txt').send('Not found');
// });



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

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}
