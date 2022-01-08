async function api(path, data){
  const d = await fetch(path,{
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data) 
  });
  return (await d.json()).data;
}

new Vue({
  el: '#app',
  data: {
    systemVolumn:{
      volume: "",
      mute: false,
    }
  },
  mounted(){
    this.initData()
  },
  methods:{
    initData(){
      this.getVolumn();
    },
    async getVolumn(){
      this.systemVolumn = await api("media/getVolumeInfo");
    },
    async dangerCall(path){
      if(confirm("是否确认操作")){
        this.call(path);
      }
    },
    async call(path){
      try {
        await api(path);
        this.initData();
      } catch (error) {
        alert("请求失败");
      }
    }
  }
})