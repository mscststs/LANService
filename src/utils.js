const os = require('os');

exports.getIPAddress = function getIPAddress(){
  var interfaces = os.networkInterfaces();
  const localIPs = [];
  for(var devName in interfaces){
    var iface = interfaces[devName];
    for(var i=0;i<iface.length;i++){
      var alias = iface[i];
      if(alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal){
        localIPs.push(alias.address);
      }
    }
  }
  return localIPs;
}
