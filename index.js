
(function(window, document) {

    'use strict';

    // This object and its contents will be made available to the global/window
    // scope. We'll use this to expose an API.
    window.api = {};

    // Configs

	   // (int) 0~255 在检测来自所述平均亮度的边缘的最小值，检测超过所述亮度的像素，因此小细节
    api.EDGE_DETECT_VALUE = 80; //50
    // (number) 在边缘点的分布比例，高于在参考生成到控制台的更多数量的点
    api.POINT_RATE = 0.075; //0.075
    // (int) 点的最大数量，点的数量不超过由POINT_RATE此值时，足够大的细节
    api.POINT_MAX_NUM = 4500; //2500
    // (int) 除了牙齿大小做删除的精细边缘，这样的小细节
    api.BLUR_SIZE = 2; //2
    // (int) 边缘检测的大小，足够大的细节
    api.EDGE_SIZE = 6; //3
    // (int) 当指定了超过此数量的像素更形象，调整允许的像素数
    api.PIXEL_LIMIT = 8000000; //360000

    // Set the values for each input to the default
    for (var key in window.api) {
        var selector = 'input[name=' + key + ']',
            el = document.querySelector(selector);

        if (el) {
            el.value = api[key];
        }
    }

    // Handle the form submission by regenerating the image
    var regenerateForm = document.querySelector('.settings-form');

    regenerateForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var message = document.getElementById('message');
        message.innerHTML = GENERATIONG_MESSAGE;

        var inputs = regenerateForm.querySelectorAll('input[type=text]');

        [].forEach.call(inputs, function (input) {
            var name = input.name,
                val = parseFloat(input.value, 10);

            api[name] = val;
        });

        api.regenerate();
    }, false);

    var GENERAL_MESSAGE = 'Drop image to change source.'; // 正常显示信息
    var GENERATIONG_MESSAGE = 'Generating...'; // 生成中の表示メッセージ
    var IMG_PRESETS = [ // 预设图像
        // insert a list of image files here, users can click these to cycle through them
        'lilac-breasted_roller.jpg',
        'apple.jpg'
        // Creative Commons attribution:
        // http://commons.wikimedia.org/wiki/File:Lilac-Breasted_Roller_with_Grasshopper_on_Acacia_tree_in_Botswana_(small)_c.jpg
        // http://commons.wikimedia.org/wiki/File:Red_Apple.jpg
    ];

    // Vars

    var image, source;
    var canvas, context;
    var imageIndex = IMG_PRESETS.length * Math.random() | 0; // 当前预设的索引
    var message; // 信息显示元素
    var generating = true; // 这表明正在生成它
    var timeoutId = null; // 对于异步处理

    // 对于显示日志
    var generateTime = 0;

    // 洗牌预设图像
    var imagePresets = (function(presets) {
        presets = presets.slice();
        var i = presets.length, j, t;
        while (i) {
            j = Math.random() * i | 0;
            t = presets[--i];
            presets[i] = presets[j];
            presets[j] = t;
        }
        return presets;
    })(IMG_PRESETS);

    //创建其他和卷积矩阵
    var blur = (function(size) {
        var matrix = [];
        var side = size * 2 + 1;
        var i, len = side * side;
        for (i = 0; i < len; i++) matrix[i] = 1;
        return matrix;
    })(api.BLUR_SIZE);

    // 创建的边缘检测卷积矩阵
    var edge = (function(size) {
        var matrix = [];
        var side = size * 2 + 1;
        var i, len = side * side;
        var center = len * 0.5 | 0;
        for (i = 0; i < len; i++) matrix[i] = i === center ? -len + 1 : 1;
        return matrix;
    })(api.EDGE_SIZE);


    /**
     * Init
     */
    function init() {
        canvas = document.createElement('canvas');
        context = canvas.getContext('2d');

        image = document.getElementById('output');
        image.addEventListener('load', adjustImage, false);

        message = document.getElementById('message');
        message.innerHTML = GENERATIONG_MESSAGE;

        // document.addEventListener('click', documentClick, false);

        document.addEventListener('drop', documentDrop, false);
        var eventPreventDefault = function(e) { e.preventDefault(); };
        document.addEventListener('dragover', eventPreventDefault, false);
        document.addEventListener('dragleave', eventPreventDefault, false);

        window.addEventListener('resize', adjustImage, false);

        source = new Image();
        source.addEventListener('load', sourceLoadComplete, false);
        setSource(imagePresets[imageIndex]);
    }

    /**
     * Document click event handler
     */
    function documentClick(e) {
        if (generating) return; // 生成中なら抜ける

        // 通过指定以下预设图像设置源
        imageIndex = (imageIndex + 1) % imagePresets.length;
        setSource(imagePresets[imageIndex]);
    }

    /**
     * Document drop event handler
     */
    function documentDrop(e) {
        if (generating) return; // 生成中なら抜ける

        e.preventDefault();

        if (!window.FileReader) {
            alert('ドラッグ&ドロップによるファイル操作に未対応のブラウザです。');
            return;
        }

        // 将源设置为指定一个下降的图像文件
        var reader = new FileReader();
        reader.addEventListener('load', function(e) {
            setSource(e.target.result);
        }, false);
        reader.readAsDataURL(e.dataTransfer.files[0]);
    }

    /**
     * Source load event handler
     *
     * @see setSource()
     */
    function sourceLoadComplete(e) {
        // 检查图像大小
        var width  = source.width;
        var height = source.height;
        var pixelNum = width * height;
        if (pixelNum > api.PIXEL_LIMIT) {
            // 调整大小对案件
            var scale = Math.sqrt(api.PIXEL_LIMIT / pixelNum);
            source.width  = width * scale | 0;
            source.height = height * scale | 0;

            // Log
            console.log('Source resizing ' + width + 'px x ' + height + 'px' + ' -> ' + source.width + 'px x ' + source.height + 'px');
        }

        // 生成を開始
        if (timeoutId) clearTimeout(timeoutId);
        generateTime = new Date().getTime();
        console.log('Generate start...');
        timeoutId = setTimeout(generate, 0);
    }

    api.regenerate = sourceLoadComplete;

    /**
     * 调整图像的大小和位置
     * image の load, window の resize 事件处理
     */
    function adjustImage() {
        image.removeAttribute('width');
        image.removeAttribute('height');
        var width  = image.width;
        var height = image.height;

        if (width > window.innerWidth || height > window.innerHeight) {
            var scale = Math.min(window.innerWidth / width, window.innerHeight / height);
            image.width  = width * scale | 0;
            image.height = height * scale | 0;
        }

        image.style.left = ((window.innerWidth - image.width) / 2 | 0) + 'px';
        image.style.top  = ((window.innerHeight - image.height) / 2 | 0) + 'px';
    }

    /**
     * 设置源
     *
     * @param {String} URL or data
     */
    function setSource(src) {
        // 这表明正在生成它
        generating = true;
        message.innerHTML = GENERATIONG_MESSAGE;

        if (source.src !== src) {
            // 初始化大小
            source.removeAttribute('width');
            source.removeAttribute('height');
            source.src = src;
        } else {
            // 被迫运行的事件处理程序，如果图像是相同的
            sourceLoadComplete(null);
        }
    }


    /**
     * 安排图像生成
     */
    function generate() {
        // 你到设置图像的尺寸和画布，检测的开始
        var width  = canvas.width = source.width;
        var height = canvas.height = source.height;

        context.drawImage(source, 0, 0, width, height);

        // 処理用 ImageData
        var imageData = context.getImageData(0, 0, width, height);
        // 用于彩色参考像素信息
        var colorData = context.getImageData(0, 0, width, height).data;

        // 应用过滤器，灰阶，模糊，边缘检测
        Filter.grayscaleFilterR(imageData);
        Filter.convolutionFilterR(blur, imageData, blur.length);
        Filter.convolutionFilterR(edge, imageData);

        // 检测在边缘上的点
        var temp = getEdgePoint(imageData);
        // 存储显示日志
        var detectionNum = temp.length;

        var points = [];
        var i = 0, ilen = temp.length;
        var tlen = ilen;
        var j, limit = Math.round(ilen * api.POINT_RATE);
        if (limit > api.POINT_MAX_NUM) limit = api.POINT_MAX_NUM;

        // ポイントを間引く
        while (i < limit && i < ilen) {
            j = tlen * Math.random() | 0;
            points.push(temp[j]);
            temp.splice(j, 1);
            tlen--;
            i++;
        }

        // 三角形分割
        var delaunay = new Delaunay(width, height);
        var triangles = delaunay.insert(points).getTriangles();

        var t, p0, p1, p2, cx, cy;

        // 涂料三角形
        for (ilen = triangles.length, i = 0; i < ilen; i++) {
            t = triangles[i];
            p0 = t.nodes[0]; p1 = t.nodes[1]; p2 = t.nodes[2];

            context.beginPath();
            context.moveTo(p0.x, p0.y);
            context.lineTo(p1.x, p1.y);
            context.lineTo(p2.x, p2.y);
            context.lineTo(p0.x, p0.y);

            // 填写的坐标的颜色的三角形来获得重心
            cx = (p0.x + p1.x + p2.x) * 0.33333;
            cy = (p0.y + p1.y + p2.y) * 0.33333;

            j = ((cx | 0) + (cy | 0) * width) << 2;

            context.fillStyle = 'rgb(' + colorData[j] + ', ' + colorData[j + 1] + ', ' + colorData[j + 2] + ')';
            context.fill();
        }

        image.src = canvas.toDataURL('image/png');

        // 查看日志
        generateTime = new Date().getTime() - generateTime;
        console.log(
            'Generate completed ' + generateTime + 'ms, ' +
            points.length + ' points (out of ' + detectionNum + ' points, ' + (points.length / detectionNum * 100).toFixed(2) + ' %), ' +
            triangles.length + ' triangles'
        );

        // 生成の完了
        generating = false;
        message.innerHTML = GENERAL_MESSAGE;
    }

    /**
     * 为了得到积分来确定边缘
     *
     * @param imageData 用于检测的边缘の ImageData源
     * @return 点的序列随机分布在边缘
     * @see EDGE_DETECT_VALUE 边缘检测する 3x3 の明度の平均値
     */
    function getEdgePoint(imageData) {
        var width  = imageData.width;
        var height = imageData.height;
        var data = imageData.data;

        var E = api.EDGE_DETECT_VALUE; // local copy

        var points = [];
        var x, y, row, col, sx, sy, step, sum, total;

        for (y = 0; y < height; y++) {
            for (x = 0; x < width; x++) {
                sum = total = 0;

                for (row = -1; row <= 1; row++) {
                    sy = y + row;
                    step = sy * width;
                    if (sy >= 0 && sy < height) {
                        for (col = -1; col <= 1; col++) {
                            sx = x + col;

                            if (sx >= 0 && sx < width) {
                                sum += data[(sx + step) << 2];
                                total++;
                            }
                        }
                    }
                }

                if (total) sum /= total;
                if (sum > E) points.push(new Array(x, y));
            }
        }

        return points;
    }


    /**
     * Filter
     */
    var Filter = {

        /**
         * 灰度滤波器，不仅因为它是为源1通道（红色）
         */
        grayscaleFilterR: function (imageData) {
            var width  = imageData.width | 0;
            var height = imageData.height | 0;
            var data = imageData.data;

            var x, y;
            var i, step;
            var r, g, b;

            for (y = 0; y < height; y++) {
                step = y * width;

                for (x = 0; x < width; x++) {
                    i = (x + step) << 2;
                    r = data[i];
                    g = data[i + 1];
                    b = data[i + 2];

                    data[i] = (Math.max(r, g, b) + Math.min(r, g, b)) >> 2;
                }
            }

            return imageData;
        },

        /**
         * 卷积滤波器，不仅因为它是为源1通道（红色）
         *
         * @see http://jsdo.it/akm2/iMsL
         */
        convolutionFilterR: function(matrix, imageData, divisor) {
            matrix  = matrix.slice();
            divisor = divisor || 1;

            // 申请除以矩阵数
            var divscalar = divisor ? 1 / divisor : 0;
            var k, len;
            if (divscalar !== 1) {
                for (k = 0, len = matrix.length; k < matrix.length; k++) {
                    matrix[k] *= divscalar;
                }
            }

            var data = imageData.data;

            // 原来的副本，以供参考，红色通道仅仅是因为灰度
            len = data.length >> 2;
            var copy = new Uint8Array(len);
            for (i = 0; i < len; i++) copy[i] = data[i << 2];

            var width  = imageData.width | 0;
            var height = imageData.height | 0;
            var size  = Math.sqrt(matrix.length);
            var range = size * 0.5 | 0;

            var x, y;
            var r, g, b, v;
            var col, row, sx, sy;
            var i, istep, jstep, kstep;

            for (y = 0; y < height; y++) {
                istep = y * width;

                for (x = 0; x < width; x++) {
                    r = g = b = 0;

                    for (row = -range; row <= range; row++) {
                        sy = y + row;
                        jstep = sy * width;
                        kstep = (row + range) * size;

                        if (sy >= 0 && sy < height) {
                            for (col = -range; col <= range; col++) {
                                sx = x + col;

                                if (
                                    sx >= 0 && sx < width &&
                                    (v = matrix[(col + range) + kstep]) // 如果该值为0,则跳过                                ) {
                                    r += copy[sx + jstep] * v;
                                }
                            }
                        }
                    }

                    // 値を挟み込む
                    if (r < 0) r = 0; else if (r > 255) r = 255;

                    data[(x + istep) << 2] = r & 0xFF;
                }
            }

            return imageData;
        }
    };


    /**
     * Delaunay
     *
     * @see http://jsdo.it/akm2/wTcC
     */
    var Delaunay = (function() {

        /**
         * Node
         *
         * @param {Number} x
         * @param {Number} y
         * @param {Number} id
         */
        function Node(x, y, id) {
            this.x = x;
            this.y = y;
            this.id = !isNaN(id) && isFinite(id) ? id : null;
        }

        Node.prototype = {
            eq: function(p) {
                var dx = this.x - p.x;
                var dy = this.y - p.y;
                return (dx < 0 ? -dx : dx) < 0.0001 && (dy < 0 ? -dy : dy) < 0.0001;
            },

            toString: function() {
                return '(x: ' + this.x + ', y: ' + this.y + ')';
            }
        };

        /**
         * Edge
         *
         * @param {Node} p0
         * @param {Node} p1
         */
        function Edge(p0, p1) {
            this.nodes = [p0, p1];
        }

        Edge.prototype = {
            eq: function(edge) {
                var na = this.nodes,
                    nb = edge.nodes;
                var na0 = na[0], na1 = na[1],
                    nb0 = nb[0], nb1 = nb[1];
                return (na0.eq(nb0) && na1.eq(nb1)) || (na0.eq(nb1) && na1.eq(nb0));
            }
        };

        /**
         * Triangle
         *
         * @param {Node} p0
         * @param {Node} p1
         * @param {Node} p2
         */
        function Triangle(p0, p1, p2) {
            this.nodes = [p0, p1, p2];
            this.edges = [new Edge(p0, p1), new Edge(p1, p2), new Edge(p2, p0)];

            // 这次不使用id
            this.id = null;

            // 创建三角形的外接圆

            var circle = this.circle = new Object();

            var ax = p1.x - p0.x, ay = p1.y - p0.y,
                bx = p2.x - p0.x, by = p2.y - p0.y,
                t = (p1.x * p1.x - p0.x * p0.x + p1.y * p1.y - p0.y * p0.y),
                u = (p2.x * p2.x - p0.x * p0.x + p2.y * p2.y - p0.y * p0.y);

            var s = 1 / (2 * (ax * by - ay * bx));

            circle.x = ((p2.y - p0.y) * t + (p0.y - p1.y) * u) * s;
            circle.y = ((p0.x - p2.x) * t + (p1.x - p0.x) * u) * s;

            var dx = p0.x - circle.x;
            var dy = p0.y - circle.y;
            circle.radiusSq = dx * dx + dy * dy;
        }


        /**
         * Delaunay
         *
         * @param {Number} width
         * @param {Number} height
         */
        function Delaunay(width, height) {
            this.width = width;
            this.height = height;

            this._triangles = null;

            this.clear();
        }

        Delaunay.prototype = {

            clear: function() {
                var p0 = new Node(0, 0);
                var p1 = new Node(this.width, 0);
                var p2 = new Node(this.width, this.height);
                var p3 = new Node(0, this.height);

                this._triangles = [
                    new Triangle(p0, p1, p2),
                    new Triangle(p0, p2, p3)
                ];

                return this;
            },

            insert: function(points) {
                var k, klen, i, ilen, j, jlen;
                var triangles, t, temps, edges, edge, polygon;
                var x, y, circle, dx, dy, distSq;

                for (k = 0, klen = points.length; k < klen; k++) {
                    x = points[k][0];
                    y = points[k][1];

                    triangles = this._triangles;
                    temps = [];
                    edges = [];

                    for (ilen = triangles.length, i = 0; i < ilen; i++) {
                        t = triangles[i];

                        // 检查坐标是否被包括在三角形的外接圆
                        circle  = t.circle;
                        dx = circle.x - x;
                        dy = circle.y - y;
                        distSq = dx * dx + dy * dy;

                        if (distSq < circle.radiusSq) {
                            // 减的情况下三角形中包含的侧面
                            edges.push(t.edges[0], t.edges[1], t.edges[2]);
                        } else {
                            // 如果不包括残留
                            temps.push(t);
                        }
                    }

                    polygon = [];

                    // 检查重复的一面，如果你要复制被删除
                    edgesLoop: for (ilen = edges.length, i = 0; i < ilen; i++) {
                        edge = edges[i];

                        // 如果重复的边缘比较删除
                        for (jlen = polygon.length, j = 0; j < jlen; j++) {
                            if (edge.eq(polygon[j])) {
                                polygon.splice(j, 1);
                                continue edgesLoop;
                            }
                        }

                        polygon.push(edge);
                    }

                    for (ilen = polygon.length, i = 0; i < ilen; i++) {
                        edge = polygon[i];
                        temps.push(new Triangle(edge.nodes[0], edge.nodes[1], new Node(x, y)));
                    }

                    this._triangles = temps;
                }

                return this;
            },

            getTriangles: function() {
                return this._triangles.slice();
            }
        };

        Delaunay.Node = Node;

        return Delaunay;

    })();


    /**
     * Point
     *
     * @super Delaunay.Node
     */
    function Point(x, y) {
        this.x = x;
        this.y = y;
        this.id = null;
    }

    Point.prototype = new Delaunay.Node();


    /**
     * 调试用 log 功能, log.limit(number) で出力数を制限
     * 进度の表示は通常の console.log
     */
    //var log=function(a){var b=0;var c=0;var d=function(){if(b){if(c>b)return;c++}a.console.log.apply(console,arguments)};d.limit=function(a){b=a};return d}(window)

    // Init
    window.addEventListener('load', init, false);

})(window, window.document);
