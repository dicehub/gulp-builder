const DEST = 'dist';

module.exports = () => ({
  dest: DEST,

  // null, 'livereload', 'browsersync'
  devServer: 'browsersync',
  browserlist: '> 0.25%, not ie 11, not dead, not samsung < 9, not ios_saf < 12',
  useHash: false,

  tasks: {
    html: {
      watchOn: 'source/html/**/*.html',
      entry: ['source/html/index.html'],
      dest: DEST,
      params: {
        root: 'source/html',
      },
    },

    css: {
      watchOn: 'source/css/**/*.css',
      entry: ['source/css/index.css'],
      dest: `${DEST}/assets/css`,
    },

    javascript: [
      {
        watchOn: ['!source/js/sw.js', 'source/js/**/*.js'],
        entry: ['source/js/index.js'],
        dest: `${DEST}/assets/js`,
      },

      {
        watchOn: 'source/js/sw.js',
        entry: 'source/js/sw.js',
        dest: DEST,
        params: {
          format: 'esm',
          useBabel: false,
          // minify: false,
        },
      },
    ],

    img: {
      watchOn: 'source/img/**/*',
      dest: `${DEST}/assets/img`,
    },

    static: {
      watchOn: 'source/static/**/*',
      dest: DEST,
    },

    icons: [
      {
        watchOn: 'source/icons/**/*.svg',
        dest: `${DEST}/assets/`,
        fileName: 'icons.svg',
        iconId: 'icon-%s',
      },
    ],
  },
});
