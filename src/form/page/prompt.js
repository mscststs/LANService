const {ipcRenderer} = require('electron');

const Store = require('electron-store');
const store = new Store();


document.querySelector("[name='ip']").value = store.get("ip") || "";
document.querySelector("[name='port']").value = store.get("port") || 16235;
document.querySelector("[name='mouseSpeed']").value = store.get("mouseSpeed") || 3;


let promptId = null;

function promptCancel() {
  ipcRenderer.sendSync('prompt-post-close:' + promptId, null);
}

function promptSubmit() {
  let form = new FormData(document.querySelector('#form'))

  const ip = form.get("ip");
  const port = form.get("port")
  const mouseSpeed = form.get("mouseSpeed")
  

  // 以上校验都通过
  store.set("ip", ip);
  store.set("port", port);
  store.set("mouseSpeed", mouseSpeed);

  ipcRenderer.sendSync('prompt-post-close:' + promptId, true);
}

document.querySelector("#cancel").addEventListener("click", function(e){
  promptCancel()
})
document.querySelector("#ok").addEventListener("click", function(e){
  promptSubmit()
})
document.querySelector("#form").addEventListener("submit", function(e){
  e.preventDefault();
  e.stopPropagation();
})


function promptRegister() {
  promptId = document.location.hash.replace('#', '');
}
promptRegister()
