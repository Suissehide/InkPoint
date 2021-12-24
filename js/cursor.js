; (function (window) {
    function Cursor(images) {
        this.Container_constructor()

        this.cursorBody = new createjs.Bitmap(images['cursor'])

        this.addChild(this.cursorFlame)
        this.addChild(this.cursorBody)

        this.makeShape()
        this.timeout = 0
        this.thrust = 0
        this.vX = 0
        this.vY = 0
        this.height = 20
        this.width = 20
        this.regX = 0
        this.regY = -20
    }
    var p = createjs.extend(Cursor, createjs.Container)

    // public properties:
    Cursor.MAX_THRUST = 10

    // public properties:
    p.cursorFlame
    p.cursorBody

    p.timeout
    p.thrust

    p.vX
    p.vY
    p.height
    p.width

    p.bounds
    p.hit

    // public methods:
    p.makeShape = function () {
        //draw cursor body
        this.cursorBody.scaleX = 0.1
        this.cursorBody.scaleY = 0.1
        this.cursorBody.rotation = 225

        //furthest visual element
        this.bounds = 0
        this.hit = this.bounds
    }

    p.tick = function (event) {
        //move by velocity
        this.x += this.vX
        this.y += this.vY

        if (this.thrust > 0) {
            this.vX = Math.sin(this.rotation * (Math.PI / -180)) * this.thrust
            this.vY = Math.cos(this.rotation * (Math.PI / -180)) * this.thrust

            this.thrust -= 0.3
        } else {
            this.thrust = 0
            this.vX = 0
            this.vY = 0
        }
    }

    p.accelerate = function () {
        //increase push ammount for acceleration
        this.thrust += 1.6
        if (this.thrust >= Cursor.MAX_THRUST) {
            this.thrust = Cursor.MAX_THRUST
        }
    }

    window.Cursor = createjs.promote(Cursor, 'Container')
})(window)
