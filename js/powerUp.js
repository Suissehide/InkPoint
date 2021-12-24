; (function (window) {
    function getRandomArbitrary(min, max) {
        return Math.random() * (max - min) + min;
    }

    function PowerUp1(images, canvasHeight, canvasWidth) {
        this.Container_constructor() // super call

        var data = {
            framerate: 30,
            "images": [images["powerUp1"], "assets/images/powerUp1.png"],
            "frames": { width: 256, height: 256, count: 1, regX: 0, regY: 0, spacing: 0, margin: 0 },
            "animations": {
                "run": [0],
            }
        };
        var spriteSheet = new createjs.SpriteSheet(data);
        var animation = new createjs.Sprite(spriteSheet, "run");
        animation.gotoAndPlay("run");
        animation.scaleX = animation.scaleY = 0.2;
        this.addChild(animation);

        this.spawn(canvasHeight, canvasWidth);
        this.create();
    }

    var p = createjs.extend(PowerUp1, createjs.Container)

    // public properties:
    PowerUp1.MAX_VELOCITY = 7

    // public properties:
    p.angle
    p.size
    p.bounds //visual radial size
    p.hit //average radial disparity

    p.score //score value

    p.speed
    p.vX //velocity X
    p.vY //velocity Y

    p.active //is it active

    // public methods:
    p.spawn = function (canvasHeight, canvasWidth) {
		this.x = getRandomArbitrary(0, canvasWidth);
		this.y = getRandomArbitrary(0, canvasHeight);
		console.log(this.x, this.y);
    }

    p.create = function () {
        this.active = true;
        this.bounds = 0;
        this.size = 20;
		this.regX = this.regY = (256 * 0.2) / 2;
        this.vX = 0;
        this.vY = 0;
        this.speed = 0.1
    }

    //handle what a dot does to itself every frame
    p.tick = function (event, cursorX, cursorY) {
        let vectorX = cursorX - this.x - 10
        let vectorY = cursorY - this.y - 10
        var length = Math.sqrt(vectorX * vectorX + vectorY * vectorY);

        if (length > 0) {
            vectorX /= length;
            vectorY /= length;

            this.angle = Math.atan2(vectorY, vectorX) - 90 * Math.PI / 180;

            //accelerate
            this.vX = vectorX * this.speed;
            this.vY = vectorY * this.speed;

            // this.x += this.vX
            // this.y += this.vY
			this.rotation += 1
			if (this.rotation >= 360)
				this.rotation = 0;

            // this.speed += 0.01;

            //cap max speeds
            // this.speed = Math.min(PowerUp1.MAX_VELOCITY, Math.max(-PowerUp1.MAX_VELOCITY, this.speed));
        }

        // this.score = (5 - this.size / 10) * 100;
    }

    p.hitPoint = function (tX, tY) {
        return this.hitRadius(tX, tY, 0)
    }

    p.hitRadius = function (tX, tY, tHit) {
        //early returns speed it up
        if (tX - tHit > this.x + this.hit) {
            return
        }
        if (tX + tHit < this.x - this.hit) {
            return
        }

        if (tY - tHit > this.y + this.hit) {
            return
        }

        if (tY + tHit < this.y - this.hit) {
            return
        }

        //now do the circle distance test
        return (
            this.hit + tHit >
            Math.sqrt(
                Math.pow(Math.abs(this.x - tX), 2) + Math.pow(Math.abs(this.y - tY), 2),
            )
        )
    }

    window.PowerUp1 = createjs.promote(PowerUp1, 'Container')
})(window)
