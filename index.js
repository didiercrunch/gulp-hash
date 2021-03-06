var crypto = require('crypto'),
    through2 = require('through2'),
	gutil = require('gulp-util'),
	assign = require('lodash.assign'),
	template = require('lodash.template'),
	path = require('path')
	Promise = require('es6-promise').Promise;

var exportObj = function(options) {
	options = assign({}, {
		algorithm: 'sha1',
		hashLength: 8,
		template: '<%= name %>-<%= hash %><%= ext %>',
		version: ''
	}, options);

	return through2.obj(function(file, enc, cb) {
		if (file.isDirectory()) {
			this.push(file);
			cb();
			return;
		}

		var fileExt = path.extname(file.relative),
			fileName = path.basename(file.relative, fileExt);

		var hasher = crypto.createHash(options.algorithm);

		var piped = file.pipe(through2(
			function(chunk, enc, updateCb) {
				hasher.update(chunk);
				updateCb(null, chunk);
			},

			function(flushCb) {
				if (options.version !== '') hasher.update(options.version);
				file.hash = hasher.digest('hex').slice(0, options.hashLength);
				file.origFilePath = file.path;
				file.origFilename = path.basename(file.relative);
				file.path = path.join(path.dirname(file.path), template(options.template, {
					hash: file.hash,
					name: fileName,
					ext: fileExt
				}));

				this.push(file);
				cb();
				flushCb();
			}.bind(this)
		));

		if (file.isStream()) {
			var newContents = through2();
			piped.pipe(newContents);
			file.contents = newContents;
		}
	});
};

var origManifestContents = {};
var appendQueue = Promise.resolve();

// Normalizes a path for the manifest file (i.e. backslashes -> slashes)
function formatManifestPath(mPath) {
	return path.normalize(mPath).replace(/\\/g, '/');
}

exportObj.manifest = function(manifestPath, append, options) {
    options = (typeof options === 'undefined' ? {} : options);
	append = (typeof append === 'undefined' ? true : append);
	var manifest = {};

    if (append && ! origManifestContents[manifestPath]) {
        try {
            var content = fs.readFileSync(manifestPath, {encoding: 'utf8'});
            origManifestContents[manifestPath] = JSON.parse(content);
        } catch (e) {
            origManifestContents[manifestPath] = {};
        }
    }

    var getManifestSrc = function(file, options){
        var ret;
        if(options.base){
            ret = path.relative(options.base, file.origFilePath);
        }else{
            ret = path.join(path.dirname(file.relative), file.origFilename);
        }
        return formatManifestPath(ret);
    };

    var getManifestDest = function(file, options){
        var ret;
        if(options.base){
            ret = path.relative(options.base, file.path);
        }else{
            ret = file.relative;
        }
        return formatManifestPath(ret);
    };

	return through2.obj(
		function(file, enc, cb) {
			if (typeof file.origFilename !== 'undefined') {
				var manifestSrc = getManifestSrc(file, options);
				var manifestDest = getManifestDest(file, options);
				manifest[manifestSrc] = manifestDest;
			}

			cb();
		},

		function(cb) {
			var contents = {},
			    finish;

			finish = function(data) {
                origManifestContents[manifestPath] = data;

				this.push(new gutil.File({
					path: manifestPath,
					contents: new Buffer(JSON.stringify(origManifestContents[manifestPath]))
				}));

				cb();
			}.bind(this);

			if (append) {
                appendQueue.then(new Promise(function(resolve, reject) {
                    finish(assign({}, origManifestContents[manifestPath], manifest));
                    resolve();
                }));
			} else {
				finish(manifest);
			}
		}
	);
};

module.exports = exportObj;
