const router = require("express").Router();

let connectDB = require("./../database.js");

let db;
connectDB
  .then((client) => {
    console.log("DB connection successful");
    db = client.db("forum");
  })
  .catch((err) => {
    console.log(err);
  });

function checkLogin(요청, 응답, next) {
  next();
}

router.get("/sub/sports", checkLogin, async (요청, 응답) => {
  try {
    const result = await db.collection("post").find().toArray();
    응답.send("스포츠 게시판");
  } catch (error) {
    응답.status(500).send("인터넷 에러");
  }
});

router.get("/sub/game", checkLogin, (요청, 응답) => {
  응답.send("게임 게시판");
});

module.exports = router;
