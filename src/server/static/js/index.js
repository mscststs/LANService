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
    touchStartX: 0, // 触摸开始时的X坐标
    touchStartY: 0, // 触摸开始时的Y坐标

    touchStartA: 0, // 触摸开始时的X坐标
    touchStartB: 0, // 触摸开始时的Y坐标

    touchMode: "pointer", // pointer | scroll | none

    systemVolumn: {
      volume: "",
      mute: false,
    }
  },
  mounted(){
    this.initData();
    this.initEventHandler();
  },
  methods:{
    initData(){
      this.getVolumn();
    },
    initEventHandler(){
      const touchPanel = this.$refs["touchPanel"];
      // 防止滚动事件, 计算触摸位移
      touchPanel.addEventListener("touchstart", (e)=>{
        if(e.touches.length == 1){
          this.touchMode = "pointer";
          this.touchStartX = e.touches[0].clientX;
          this.touchStartY = e.touches[0].clientY;
        }else if (e.touches.length == 2){
          this.touchMode = "scroll";
          this.touchStartX = e.touches[0].clientX;
          this.touchStartY = e.touches[0].clientY;
          this.touchStartA = e.touches[1].clientX;
          this.touchStartB = e.touches[1].clientY;
        }
      })
      
      touchPanel.addEventListener("touchmove", (e)=>{
        e.preventDefault();
        if(this.touchMode === "pointer"){
          const x = e.touches[0].clientX;
          const y = e.touches[0].clientY;
          const dx = x - this.touchStartX;
          const dy = y - this.touchStartY;
          this.touchStartX = x;
          this.touchStartY = y;
          this.handleMove(dx, dy); // 处理指针移动事件
        }
        if(this.touchMode.startsWith("scroll")){
          const x = e.changedTouches[0].clientX;
          const y = e.changedTouches[0].clientY;
          const a = e.changedTouches[1].clientX;
          const b = e.changedTouches[1].clientY;
          
          const scrollX = (x + a) - (this.touchStartX + this.touchStartA);
          const scrollY = (y + b) - (this.touchStartY + this.touchStartB);

          this.touchStartX = x;
          this.touchStartY = y;
          this.touchStartA = a;
          this.touchStartB = b;

          api("system/scrollMouse",{x: scrollX, y: scrollY});
          this.touchMode = "scroll-in"
        }
      });
      touchPanel.addEventListener("touchend", (e)=>{
        if(e.touches.length + e.changedTouches.length <= 1){
          return;
        }

        if(this.touchMode === "scroll"){
          const x = e.changedTouches[0].clientX;
          const y = e.changedTouches[0].clientY;
          const a = e.changedTouches[1]?.clientX || e.touches[0].clientX;
          const b = e.changedTouches[1]?.clientY || e.touches[0].clientY;

          // 如果所有的点位都没有动

          if(Array.from(new Set([x,y,a,b,this.touchStartX,this.touchStartY,this.touchStartA,this.touchStartB])).length === 4){
            api("system/click", {btn: "right"});
            this.touchMode = "none";
            return;
          }
        }
      });

      touchPanel.addEventListener("click", (e)=>{
        api("system/click");
      });
      touchPanel.addEventListener("dblclick", (e)=>{
        api("system/click",{double: true});
      });
    },
    async handleMove(dx, dy){
      await api("system/pointerMove", {dx, dy});
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