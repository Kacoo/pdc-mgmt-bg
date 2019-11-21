var express = require('express');
var bodyParser = require('body-parser')
var qs = require('qs')
var app = express();

// 不知道用来干啥，可能是对post的body数据json化？
app.use(bodyParser.json({limit: '1mb'})); // 支持1mb的post数据
app.use(bodyParser.urlencoded({ extended: false }));

//设置跨域访问
app.all('*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  // res.header("X-Powered-By", ' 3.2.1');
  res.header("Content-Type", "application/json;charset=utf-8");
  // res.header("Content-Type", "application/x-www-form-urlencoded");
  next();
});

// 写个接口
app.post('/images', function (req, res) {
  let content = req.body
  // console.log(content)
  let data = sendImage(qs.stringify(content));
  res.status(200),
    res.send({
      'data': data
    })
});

//配置服务端口
var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
})

// 百度识图接口相关的配置
// 百度识图接口：https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic
// access_token=24.683b4642a86b3901a2ce9bbbed7a15a8.2592000.1576760951.282335-17808912
var sendImage = function (postData) {
  let opt = {
    host: 'aip.baidubce.com',
    // port: 80, //It sounds like you are trying to use port 80 for https?:(
    method: 'POST',
    path: '/rest/2.0/ocr/v1/accurate_basic?access_token=24.683b4642a86b3901a2ce9bbbed7a15a8.2592000.1576760951.282335-17808912',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // 'Content-Length': Buffer.byteLength(postData)
    }
  }

  var https = require('https');
  var req = https.request(opt, function (res) {
    console.log(`状态码: ${res.statusCode}`);
    console.log(`响应头: ${JSON.stringify(res.headers)}`);

    res.on('data', function (data) {
      // console.log("Response:");
      let resData = JSON.parse(data)
      console.log(resData);
      // res.send(resData)
    });
  });

  req.on('error', function (e) {
    console.log("ERROR:");
    console.log(e);
  });

  req.write(postData);
  req.end();
  
};