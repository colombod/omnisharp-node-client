const gulp = require('gulp');
const through = require('through2');
const gutil = require('gulp-util');
const merge = require('merge-stream');
const del = require('del');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const win32 = process.platform === "win32";
const spawn = require('child_process').spawn;
const glob = require('glob');
var babel = require("gulp-babel");
var gulpPath = path.join(__dirname, 'node_modules/.bin/gulp' + (win32 && '.cmd' || ''));
var ts = require('ntypescript');

var metadata = {
    lib: ['lib/**/*.ts', '!lib/**/*.d.ts'],
    spec: ['spec/**/*.ts', '!spec/**/*.d.ts'],
};

// Simply take TS code and strip anything not javascript
// Does not do any compile time checking.
function tsTranspile() {
    return through.obj(function(file, enc, cb) {
        if (file.isNull()) {
            cb(null, file);
            return;
        }

        try {
            var res = ts.transpile(file.contents.toString(), {
                module: ts.ModuleKind.ES6,
                target: ts.ScriptTarget.ES6
            }, file.path);

            file.contents = new Buffer(res);
            file.path = gutil.replaceExtension(file.path, '.js');
            gutil.log(gutil.colors.cyan('Writing ') + gutil.colors.green(_.trim(file.path.replace(__dirname, ''), path.sep)));

            this.push(file);
        } catch (e) {
            console.log('failed', file.path, e);
        }

        cb();
    });
}

function tsTranspiler(source, dest) {
    return source
        .pipe(tslint())
        .pipe(tsTranspile())
        .pipe(babel())
        .pipe(gulp.dest(dest))
        .pipe(tslint.report('prose'));
}

gulp.task('typescript', ['clean'], function() {
    var lib = tsTranspiler(gulp.src(metadata.lib), './lib');
    var spec = tsTranspiler(gulp.src(metadata.spec), './spec');

    return merge(lib, spec);
});

gulp.task('clean', ['clean:lib', 'clean:spec']);

gulp.task('clean:lib', function(done) {
    del(metadata.lib.map(z => z.indexOf('.d.ts') > -1 ? z : z.replace('.ts', '.js')), function(err, paths) {
        _.each(paths, function(path) {
            gutil.log(gutil.colors.red('Deleted ') + gutil.colors.magenta(path.replace(__dirname, '').substring(1)));
        });
        done();
    });
});

gulp.task('clean:spec', function(done) {
    del(metadata.spec.map(z => z.indexOf('.d.ts') > -1 ? z : z.replace('.ts', '.js')), function(err, paths) {
        _.each(paths, function(path) {
            gutil.log(gutil.colors.red('Deleted ') + gutil.colors.magenta(path.replace(__dirname, '').substring(1)));
        });
        done();
    });
});

gulp.task('sync-clients', [], function() {
    const omnisharpServer = fs.readFileSync('./omnisharp-server.d.ts').toString();
    _.each(['v1', 'v2'], function(version) {
        const VERSION = version.toUpperCase();
        const regex = new RegExp('declare module OmniSharp\\.Events {[\\s\\S]*?interface '+VERSION+' {([\\s\\S]*?)}');

        const interf = omnisharpServer.match(regex)[1];
        const properties = [];
        _.each(_.trim(interf).split('\n'), function(line) {
            line = _.trim(line);
            if (_.startsWith(line, '//')) return;

            const name = line.indexOf(':');
            if (line && name > -1) {
                properties.push({
                    line: _.trimRight(line.substr(name), ';').replace('CombinationKey<', 'OmniSharp.CombinationKey<').replace('Context<', 'OmniSharp.Context<'),
                    name: line.substr(0, name)
                });
            }
        });

        const regex2 = new RegExp('declare module OmniSharp\\.Events\\.Aggregate {[\\s\\S]*?interface '+VERSION+' {([\\s\\S]*?)}');
        const interf2 = omnisharpServer.match(regex2)[1];
        const aggregateProperties = [];
        _.each(_.trim(interf2).split('\n'), function(line) {
            line = _.trim(line);
            if (_.startsWith(line, '//')) return;

            const name = line.indexOf(':');
            if (line && name > -1) {
                aggregateProperties.push({
                    line: _.trimRight(line.substr(name), ';').replace('CombinationKey<', 'OmniSharp.CombinationKey<').replace('Context<', 'OmniSharp.Context<'),
                    name: line.substr(0, name)
                });
            }
        });

        const result = _.template('\
// THIS FILE IS GENERATED BY GULP TASK: "sync-clients"\n\
import {Client${VERSION}} from "../clients/client-${version}";\n\
import {ObservationClientBase, CombinationClientBase} from "./composite-client-base";\n\
import {merge, aggregate} from "../decorators";\n\
type CombinationKey<T> = OmniSharp.CombinationKey<T>;\n\
type Context<TRequest, TResponse> = OmniSharp.Context<TRequest, TResponse>;\n\
\n\
export class ObservationClient${VERSION}<T extends Client${VERSION}> extends ObservationClientBase<T> implements OmniSharp.Events.${VERSION} {\
<% _.each(properties, function(property){ %>\n    @merge public get ${property.name}()${property.line} { throw new Error("Implemented by decorator"); }<% }); %>\n\
}\n\
\n\
export class AggregateClient${VERSION}<T extends Client${VERSION}> extends CombinationClientBase<T> implements OmniSharp.Events.Aggregate.${VERSION} {\
<% _.each(aggregateProperties, function(property){ %>\n    @aggregate public get ${property.name}()${property.line} { throw new Error("Implemented by decorator"); }<% }); %>\n\
}\n')({ properties: properties, aggregateProperties: aggregateProperties, VERSION: VERSION, version: version });

        fs.writeFileSync('./lib/aggregate/composite-client-'+version+'.ts', result);
    });
});

gulp.task('watch', function() {
    // Watch is not installed by default if you want to use it
    //  you need to install manually but don't save it as it causes CI issues.
    const watch = require('gulp-watch');
    // Auto restart watch when gulpfile is changed.
    const p = spawn(gulpPath, ['file-watch'], {stdio: 'inherit'});
    return watch('gulpfile.js', function() {
        p.kill();
        p = spawn(gulpPath, ['file-watch'], {stdio: 'inherit'});
    });
});

gulp.task('file-watch', function() {
    // Watch is not installed by default if you want to use it
    //  you need to install manually but don't save it as it causes CI issues.
    const watch = require('gulp-watch');
    const plumber = require('gulp-plumber');
    const newer = require('gulp-newer');

    const lib = tsTranspiler(gulp.src(metadata.lib)
        .pipe(watch(metadata.lib))
        .pipe(plumber())
        .pipe(newer('./lib')), './lib')

    const spec = tsTranspiler(gulp.src(metadata.spec)
        .pipe(watch(metadata.spec))
        .pipe(plumber())
        .pipe(newer('./spec')), './spec');

    return merge(lib, spec);
});

gulp.task('npm-prepublish', ['typescript']);

// The default task (called when you run `gulp` from CLI)
gulp.task('default', ['typescript']);
