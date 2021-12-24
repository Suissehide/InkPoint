; (function (window) {
    function getRandomArbitrary(min, max) {
        return Math.random() * (max - min) + min;
    }

    function Dot(images, canvasHeight, canvasWidth) {
        this.Container_constructor() // super call

        var data = {
            framerate: 30,
            "images": [images["dot"], "assets/images/dot-sprites.png"],
            "frames": { width: 256, height: 256, count: 2, regX: 0, regY: 0, spacing: 0, margin: 0 },
            "animations": {
                "run": [0, 1, "run", 0.1],
            }
        };
        var spriteSheet = new createjs.SpriteSheet(data);
        var animation = new createjs.Sprite(spriteSheet, "run");
        animation.gotoAndPlay("run");
        animation.scaleX = 0.07;
        animation.scaleY = 0.07;
        this.addChild(animation);

        this.spawn(canvasHeight, canvasWidth);
        this.create();
    }

    var p = createjs.extend(Dot, createjs.Container)

    // public properties:
    Dot.MAX_VELOCITY = 7

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
    p.frozen
    p.death

    // public methods:
    p.spawn = function (canvasHeight, canvasWidth) {
        let side = Math.floor(getRandomArbitrary(0, 4));
        switch (true) {
            case (side === 0):
                this.y = getRandomArbitrary(0, canvasHeight);
                this.x = 0;
                break;
            case (side === 1):
                this.y = getRandomArbitrary(0, canvasHeight);
                this.x = canvasWidth;
                break;
            case (side === 2):
                this.y = 0;
                this.x = getRandomArbitrary(0, canvasWidth);
                break;
            case (side === 3):
                this.y = canvasHeight;
                this.x = getRandomArbitrary(0, canvasWidth);
                break;
            default:
                break;
        }
    }

    p.create = function () {
        this.active = true;
        this.bounds = 0;
        this.size = 20;
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

            this.x += this.vX
            this.y += this.vY

            this.speed += 0.01;

            //cap max speeds
            this.speed = Math.min(Dot.MAX_VELOCITY, Math.max(-Dot.MAX_VELOCITY, this.speed));
        }

        // this.score = (5 - this.size / 10) * 100;
    }

    //position the dot so it floats on screen
    p.floatOnScreen = function (width, height) {
        //base bias on real estate and pick a side or top/bottom
        if (Math.random() * (width + height) > width) {
            //side; ensure velocity pushes it on screen
            if (this.vX > 0) {
                this.x = -2 * this.bounds
            } else {
                this.x = 2 * this.bounds + width
            }
            //randomly position along other dimension
            if (this.vY > 0) {
                this.y = Math.random() * height * 0.5
            } else {
                this.y = Math.random() * height * 0.5 + 0.5 * height
            }
        } else {
            //top/bottom; ensure velocity pushes it on screen
            if (this.vY > 0) {
                this.y = -2 * this.bounds
            } else {
                this.y = 2 * this.bounds + height
            }
            //randomly position along other dimension
            if (this.vX > 0) {
                this.x = Math.random() * width * 0.5
            } else {
                this.x = Math.random() * width * 0.5 + 0.5 * width
            }
        }
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

    window.Dot = createjs.promote(Dot, 'Container')
})(window)
