if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const gulp = require('gulp');
const path = require('path');
const fs = require('fs');
const args = require('minimist')(process.argv);
const _ = require('gulp-load-plugins')();
const browserSync = require('browser-sync').create();
const nanoid = require('nanoid');

const errorHandler = (err) => {
  _.notify.onError({
    title: 'Gulp error in ' + err.plugin,
    message: err.toString(),
  })(err);
};

const LOCALS = {
  MINIFY: null,
  NODE_ENV: process.env.NODE_ENV,
  ENV: process.env.NODE_ENV,
  ROOT: args.root || __dirname,
  BUILD_VERSION: `_${nanoid(14)}_`,
  HASH: '',
};

//
// ------------
const PP = (p, params = {}) => {
  const parse = (p) => {
    let $path = p;

    if (p.charAt(0) === '!') {
      $path = '!' + path.resolve(LOCALS.ROOT, p.substr(1));
    } else {
      $path = path.resolve(LOCALS.ROOT, p);
    }

    return $path;
  };

  if (Array.isArray(p)) {
    return p.map(parse);
  }

  return parse(p);
};

//
// ------------
const tasksConfig = (() => {
  const defaultConfig = {
    // null, 'livereload', 'browsersync'
    devServer: 'browsersync',
    browserlist: '> 1%, ie 11',
    useHash: true,
  };

  let configPath = path.resolve(LOCALS.ROOT, './.gulp-config.js');
  const config = require(fs.existsSync(configPath) ? configPath : path.resolve(__dirname, './.gulp-config.js'))(LOCALS);

  return Object.assign({}, defaultConfig, config);
})();

//
// ------------
module.html = (config) => {
  return gulp
    .src(PP(config.entry))
    .pipe(_.plumber({ errorHandler }))
    .pipe(
      _.include({
        includePaths: [PP(config.params.root)],
        extensions: config.params.extensions || 'html',
      })
    )
    .pipe(
      _.mustache(LOCALS, {
        tags: config.params.tags || ['{%', '%}'],
      })
    )
    .pipe(gulp.dest(PP(config.dest)))
    .pipe(_.if(tasksConfig.devServer === 'browsersync', browserSync.stream(), null))
    .pipe(_.if(tasksConfig.devServer === 'livereload', _.livereload(), null));
};

module.css = (config) => {
  const mediaOptions = {
    sizes: {
      sm: '576px',
      md: '768px',
      lg: '992px',
      xl: '1200px',
    },
  };

  const preSass = [
    require('postcss-easy-import')(),
    require('@notiv/postcss-property-lookup')({
      lookupPattern: /@([a-z-]+)\b/g,
    }),
    require('postcss-media-functions').generateVariables(mediaOptions, 'scss'),
    require('postcss-simple-vars')({
      silent: true,
      keep: true,
      variables: {
        isDevelopment: LOCALS.ENV === 'development',
      },
    }),
  ];

  const postSass = [
    require('postcss-media-functions')(mediaOptions),

    require('postcss-selector-matches'),
    require('postcss-selector-not'),

    require('postcss-transition')({
      duration: 'var(--transition-duration)',
      delay: 'var(--transition-delay)',
      timingFunction: 'var(--transition-function)',
    }),

    require('postcss-fluid'),

    require('autoprefixer')({
      // Work with IE
      // grid: true,
      overrideBrowserslist: tasksConfig.browserlist,
    }),

    // require('doiuse')(tasksConfig.browserlist),

    require('css-mqpacker')({
      sort: require('sort-css-media-queries'),
    }),
  ];

  if (LOCALS.MINIFY) {
    postSass.splice(
      postSass.length - 1,
      0,
      require('postcss-clean')({
        level: {
          1: {
            specialComments: 0,
          },
        },
      })
    );
  }

  return gulp
    .src(PP(config.entry))
    .pipe(_.plumber({ errorHandler }))

    .pipe(
      _.postcss(preSass, {
        parser: require('postcss-scss'),
      })
    )

    .pipe(
      _.sass({
        outputStyle: 'expanded',
      }).on('error', _.sass.logError)
    )

    .pipe(_.postcss(postSass))
    .pipe(_.if(!!LOCALS.HASH, _.rename({ suffix: LOCALS.HASH })))

    .pipe(gulp.dest(PP(config.dest)))
    .pipe(_.if(tasksConfig.devServer === 'browsersync', browserSync.stream(), null))
    .pipe(_.if(tasksConfig.devServer === 'livereload', _.livereload(), null));
};

module.javascript = async (config) => {
  if (!config.params) {
    config.params = {};
  }

  const entries = (() => {
    let entry = PP(config.entry);

    if (!Array.isArray(entry)) {
      entry = [entry];
    }

    return entry
      .map((path) => {
        return fs.existsSync(path) ? path : null;
      })
      .filter((a) => a);
  })();

  if (!entries.length) {
    return;
  }

  const rollup = require('rollup');
  const replace = require('rollup-plugin-replace');
  const postcss = require('rollup-plugin-postcss');
  const resolve = require('rollup-plugin-node-resolve');
  const babel = require('rollup-plugin-babel');
  const { terser } = require('rollup-plugin-terser');
  const commonjs = require('rollup-plugin-commonjs');

  const options = {
    input: entries,
    output: {
      dir: PP(config.dest),
      entryFileNames: LOCALS.HASH ? `[name]${LOCALS.HASH}.js` : '[name].js',
      sourcemap: !LOCALS.MINIFY,
      format: config.params.format || 'system',
      name: config.params.name,
      // amd, cjs, system, esm, iife, umd
    },
    plugins: [
      replace({
        'process.env.NODE_ENV': JSON.stringify(LOCALS.NODE_ENV),
        'process.env.BUILD_VERSION': JSON.stringify(LOCALS.BUILD_VERSION),
        'process.env.HASH': JSON.stringify(LOCALS.HASH),
      }),

      resolve({
        browser: true,
      }),

      commonjs(),
      postcss(),
    ],
  };

  // undefined, userbabel === true
  if (!config.params.hasOwnProperty('useBabel') || config.params.useBabel === true) {
    options.plugins.push(
      babel({
        exclude: /node_modules/,
        presets: [
          [
            '@babel/env',
            {
              useBuiltIns: 'usage',
              corejs: '2',
              modules: false,
              targets: tasksConfig.browserlist,
            },
          ],
        ],
        plugins: ['@babel/plugin-syntax-dynamic-import'],
      })
    );
  }

  if (LOCALS.MINIFY && config.params.minify !== false) {
    options.plugins.push(terser());
  }

  const bundle = await rollup.rollup(options);
  await bundle.generate(options);

  const { output } = await bundle.write(options);

  if (tasksConfig.devServer === 'livereload') {
    _.livereload.reload(output.fileName);
  }
  if (tasksConfig.devServer === 'browsersync') {
    browserSync.reload(output.fileName);
  }
};

module.img = (config) => {
  return gulp
    .src(PP(config.watchOn))
    .pipe(
      _.imagemin([
        // PNG
        require('imagemin-pngquant')({
          quality: [0.7, 0.9],
        }),

        require('imagemin-zopfli')({
          more: true,
          iterations: LOCALS.minify ? 50 : 15,
        }),

        // gif
        // _.imagemin.gifsicle({
        //     interlaced: true,
        //     optimizationLevel: 3
        // }),

        // gif very light lossy, use only one of gifsicle or Giflossy
        require('imagemin-giflossy')({
          optimizationLevel: 3,
          optimize: 3, // keep-empty: Preserve empty transparent frames
          lossy: 2,
        }),

        // svg
        _.imagemin.svgo({
          plugins: [
            {
              removeViewBox: false,
            },
          ],
        }),

        // jpg lossless
        _.imagemin.jpegtran({
          progressive: true,
        }),

        // jpg very light lossy, use vs jpegtran
        require('imagemin-mozjpeg')({
          quality: 75,
        }),
      ])
    )
    .pipe(gulp.dest(PP(config.dest)))
    .pipe(_.if(tasksConfig.devServer === 'browsersync', browserSync.stream(), null))
    .pipe(_.if(tasksConfig.devServer === 'livereload', _.livereload(), null));
};

module.static = (config) => {
  return gulp
    .src(PP(config.watchOn))
    .pipe(gulp.dest(PP(config.dest)))
    .pipe(_.if(tasksConfig.devServer === 'browsersync', browserSync.stream(), null))
    .pipe(_.if(tasksConfig.devServer === 'livereload', _.livereload(), null));
};

module.icons = (config) => {
  return gulp
    .src(PP(config.watchOn))
    .pipe(_.plumber({ errorHandler }))
    .pipe(
      _.svgSprite({
        shape: {
          id: {
            generator: config.iconId,
            separator: '-',
            whitespace: '-',
          },
        },
        mode: {
          symbol: {
            dest: '.',
            sprite: config.fileName,
            // example: true,
          },
        },
        svg: {
          xmlDeclaration: false,
          doctypeDeclaration: false,
          namespaceIDs: false,
          namespaceClassnames: false,
          precision: 2,
        },
      })
    )
    .pipe(gulp.dest(PP(config.dest)))
    .pipe(_.if(tasksConfig.devServer === 'browsersync', browserSync.stream(), null))
    .pipe(_.if(tasksConfig.devServer === 'livereload', _.livereload(), null));
};

module.browserSync = () => {
  browserSync.init({
    server: {
      baseDir: PP(tasksConfig.dest),
    },
    port: 3030,
    open: false,
  });
};

module.livereload = () => {
  _.livereload.listen();
};

module.build = () => {
  for (let task in tasksConfig.tasks) {
    if (Array.isArray(tasksConfig.tasks[task])) {
      tasksConfig.tasks[task].forEach((t) => module[task](t));
    }

    //
    else {
      module[task](tasksConfig.tasks[task]);
    }
  }
};

gulp.task('clean', () => {
  const rmfr = require('rmfr');

  // rmfr(path.resolve(process.cwd(), '.cache'));
  console.log('Removing', PP(tasksConfig.dest));

  rmfr(PP(tasksConfig.dest));
  // rmfr(path.resolve(process.cwd(), 'sw.js'));
  // rmfr(path.resolve(process.cwd(), 'page-min.jpg'));
  // rmfr(path.resolve(process.cwd(), 'assets'));
});

gulp.task('watch', () => {
  for (let task in tasksConfig.tasks) {
    if (Array.isArray(tasksConfig.tasks[task])) {
      tasksConfig.tasks[task].forEach((t) => {
        _.watch(PP(t.watchOn), () => module[task](t));
      });
    }

    //
    else {
      _.watch(PP(tasksConfig.tasks[task].watchOn), () => module[task](tasksConfig.tasks[task]));
    }
  }

  if (tasksConfig.devServer === 'browsersync') {
    module.browserSync();
  } else if (tasksConfig.devServer === 'livereload') {
    module.livereload();
  }

  module.build();
});

gulp.task('production', () => {
  process.env.NODE_ENV = 'production';

  LOCALS.MINIFY = true;
  LOCALS.HASH = tasksConfig.useHash ? LOCALS.BUILD_VERSION : '';
  LOCALS.ENV = process.env.NODE_ENV;
  LOCALS.NODE_ENV = process.env.NODE_ENV;

  module.build();
});

gulp.task('review', () => {
  process.env.NODE_ENV = 'production';

  LOCALS.MINIFY = true;
  LOCALS.HASH = tasksConfig.useHash ? LOCALS.BUILD_VERSION : '';
  LOCALS.ENV = process.env.NODE_ENV;
  LOCALS.NODE_ENV = process.env.NODE_ENV;

  gulp.start('watch');
});
