There are plenty of examples of using the SPN buid on https://mimicproject.com.  Here's an example of starting up the audio engine:

```
	async function maxi(){
		let m = await maximilian();


			/**
			 * maxiAudio.init() initialises the Audio Context and should execute in a button click event handler to prevent the console warning
			 * "The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://goo.gl/7K7WLu"
			 */
			let playAudio = () => {


				let myOsc = new m.maxiOsc();
				let lfo1 = new m.maxiOsc();
				let lfo2 = new m.maxiOsc();
				let maxiAudio = new m.maxiAudio();
				let dist = new m.maxiNonlinearity();

				maxiAudio.init();

				maxiAudio.play = function () {
					let w = myOsc.saw(50);
					w = dist.asymclip(w*50, lfo1.sinewave(0.5) * 3, lfo2.coswave(0.6) * 3);
					return w;
				}
			}

			const playButton = document.getElementById('playButton');
			playButton.addEventListener("click", () => playAudio());

	 };

	 maxi();

```
