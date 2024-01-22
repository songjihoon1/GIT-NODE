const express = require("express");
const app = express();
const { mongoClient, ObjectId } = require("mongodb");
const methodOverride = require("method-override");
const bcrypt = require("bcrypt");
require("dotenv").config();

app.use(methodOverride("_method"));
app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const MongoStore = require("connect-mongo");

app.use(passport.initialize());
app.use(
  session({
    secret: process.env.SESSIONPW,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 },
    store: MongoStore.create({
      mongoUrl: process.env.DB_URL,
    }),
  })
);

app.use(passport.session());

const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = new S3Client({
  region: "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "songjihoonforum1",
    key: function (요청, file, cb) {
      cb(null, Date.now().toString()); //업로드시 파일명 변경가능
    },
  }),
});

let connectDB = require("./database.js");

let db;
connectDB
  .then((client) => {
    console.log("DB연결성공");
    db = client.db("forum");
    app.listen(process.env.PORT, () => {
      console.log("http://localhost:8080 에서 서버 실행중");
    });
  })
  .catch((err) => {
    console.log(err);
  });

function checkLogin(요청, 응답, next) {
  if (!요청.user) {
    응답.send("로그인하세요");
  }
  next();
}

app.get("/", (요청, 응답) => {
  응답.sendFile(__dirname + "/index.html");
});

app.get("/list", async (요청, 응답) => {
  let result = await db.collection("post").find().toArray();
  응답.render("list.ejs", { posts: result });
});

app.get("/write", (요청, 응답) => {
  응답.render("write.ejs");
});

app.post("/add", upload.array("img1", 2), async (요청, 응답) => {
  console.log(요청.files.location);

  try {
    if (요청.body.title == "") {
      응답.send("제목입력안했는데?");
    } else {
      await db.collection("post").insertOne({
        title: 요청.body.title,
        content: 요청.body.content,
        img: 요청.files.location,
      });

      응답.redirect("/list");
    }
  } catch (e) {
    console.log(e);
    응답.status(500).send("서버에러남");
  }
});

app.get("/detail/:id", async (요청, 응답) => {
  try {
    let result = await db
      .collection("post")
      .findOne({ _id: new ObjectId(요청.params.id) });
    console.log(요청.params);
    if (result == null) {
      응답.status(400).send("이상한 url 입력함");
    }
    응답.render("detail.ejs", { result: result });
  } catch (e) {
    console.log(e);
    응답.status(400).send("이상한 url 입력함");
  }
});

app.get("/edit/:id", async (요청, 응답) => {
  let result = await db
    .collection("post")
    .findOne({ _id: new ObjectId(요청.params.id) });
  console.log(result);
  응답.render("edit.ejs", { result: result });
});

app.post("/edit", async (요청, 응답) => {
  await db
    .collection("post")
    .updateOne(
      { _id: new ObjectId(요청.body.id) },
      { $set: { title: 요청.body.title, content: 요청.body.content } }
    );
  console.log(요청.body);
  응답.redirect("/list");
});

app.delete("/delete", async (요청, 응답) => {
  console.log(요청.query);
  await db
    .collection("post")
    .deleteOne({ _id: new ObjectId(요청.query.docid) });
  응답.send("삭제완료");
});

app.get("/list/:id", async (요청, 응답) => {
  let result = await db
    .collection("post")
    .find()
    .skip((요청.params.id - 1) * 5)
    .limit(5)
    .toArray();
  응답.render("list.ejs", { posts: result });
});

passport.use(
  new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    let result = await db
      .collection("user")
      .findOne({ username: 입력한아이디 });
    if (!result) {
      return cb(null, false, { message: "아이디가 일치하지 않습니다." });
    }

    if (await bcrypt.compare(입력한비번, result.password)) {
      return cb(null, result);
    } else {
      return cb(null, false, { message: "비번불일치" });
    }
  })
);

passport.serializeUser((user, done) => {
  console.log(user);
  process.nextTick(() => {
    done(null, { id: user._id, username: user.username });
  });
});

passport.deserializeUser(async (user, done) => {
  let result = await db
    .collection("user")
    .findOne({ _id: new ObjectId(user.id) });
  delete result.password;
  process.nextTick(() => {
    return done(null, user);
  });
});

app.get("/login", async (요청, 응답) => {
  응답.render("login.ejs");
});

app.post("/login", async (요청, 응답, next) => {
  passport.authenticate("local", (error, user, info) => {
    if (error) return 응답.status(500).json(error);
    if (!user) return 응답.status(401).json(info.message);
    요청.logIn(user, (err) => {
      if (err) return next(err);
      응답.redirect("/");
    });
  })(요청, 응답, next);
});

app.get("/register", (요청, 응답) => {
  응답.render("register.ejs");
});

app.get("/search", async (요청, 응답) => {
  console.log(요청.query.val);
  let result = await db
    .collection("post")
    .find({ title: 요청.query.val })
    .toArray();
  응답.render("search.ejs", { 글목록: result });
});

app.post("/register", async (요청, 응답) => {
  let 해시 = await bcrypt.hash(요청.body.password, 10);
  await db
    .collection("user")
    .insertOne({ username: 요청.body.username, password: 해시 });
  응답.redirect("/");
});

app.use("/shop", require("./routes/shop.js"));

app.use("/borad", require("./routes/borad.js"));
