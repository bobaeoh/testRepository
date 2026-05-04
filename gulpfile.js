var gulp = require('gulp');
var sass = require('gulp-sass')(require('sass')); // ✅ gulp-sass + sass 최신 방식
var clean = require('gulp-clean');
var autoprefixer = require('gulp-autoprefixer');
var browserSync = require('browser-sync');
var sourcemaps = require('gulp-sourcemaps');
var pretty = require('gulp-pretty-html');
var removeSourcemaps = require('gulp-remove-sourcemaps');
var gulpIf = require('gulp-if');
var fileinclude = require('gulp-file-include');
var removeEmptyLines = require('gulp-remove-empty-lines');
var replace = require('gulp-replace'); // ✅ 절대경로 치환용
const path = require('path');
const through = require('through2'); // ✅ file:// 상대경로 변환용

const server = browserSync.create();

// const BASE_PATH = 'publish_init'; // ✅ aws 폴더명 상수

// === 파일 경로 설정 ===
const paths = {
  css: {
    src: './resources/scss/**/*.scss',
    dest: './resources/css/',
  },
  html: {
    src: './html-dev/**/**.html',
    watch: ['./html-dev/', './includes/', './resources/images/'],
    dest: './html/',
  },
  js: {
    src: './html/*.html',
  },
};

// === SCSS 컴파일 함수 ===
function css_compile(bool) {
  return gulp
    .src(paths.css.src)
    .pipe(gulpIf(bool, sourcemaps.init()))
    .pipe(sass({outputStyle: 'expanded', sourcemap: bool}).on('error', sass.logError))
    .pipe(gulpIf(bool, sourcemaps.write()))
    .pipe(gulpIf(!bool, removeSourcemaps()))
    .pipe(autoprefixer())
    .pipe(gulp.dest(paths.css.dest));
}

// === SCSS 개발용 컴파일 ===
function css_compile_dev(done) {
  css_compile(true);
  done();
}

// === SCSS 빌드용 컴파일 ===
function css_compile_build(done) {
  css_compile(false);
  done();
}

// === CSS 삭제 ===
function css_clean() {
  return gulp.src(paths.css.dest, {read: false}).pipe(clean());
}

// === HTML 컴파일 (개발서버용: 경로 변경 없음) ===
function html_compile() {
  return (
    gulp
      .src(paths.html.src)
      .pipe(
        fileinclude({
          prefix: '@@',
          basepath: path.join(__dirname, 'includes'),
        })
      )
      // .pipe(removeEmptyLines()) // 필요하면 활성화
      .pipe(
        pretty({
          indent_size: 2,
          indent_char: ' ',
          end_with_newlines: true,
        })
      )
      .pipe(gulp.dest(paths.html.dest))
  );
}

// === HTML 개발용 컴파일 ===
function html_compile_dev(done) {
  html_compile_file();
  done();
}

// === HTML 삭제 ===
function html_clean() {
  return gulp.src(paths.html.dest, {read: false}).pipe(clean());
}

// === 새로고침 ===
function reload(done) {
  server.reload();
  done();
}

// === 로컬 서버 설정 ===
function serve(done) {
  server.init({
    port: 9002,
    files: ['html/*.{html}', 'resources/**/*.{css,js,img}'],
    server: {baseDir: './'},
    startPath: 'html/views/index.html',
    browser: 'chrome',
    reloadDelay: 800,
  });
  done();
}

// === 파일 변경 감시 ===
var watch = () => {
  gulp.watch(paths.css.src, gulp.series(css_compile_dev, reload));
  gulp.watch(paths.html.watch, gulp.series(html_compile_dev, reload));
  gulp.watch(paths.js.src);
};

// === ⬇️ file:// 로 직접 열어볼 때를 위한 상대경로 자동 변환 Transform ===
function toFileProtocolPaths() {
  return through.obj(function (file, _, cb) {
    if (file.isBuffer()) {
      const html = file.contents.toString();
      const fromDir = path.dirname(file.path);

      // 프로젝트 내 실제 폴더 경로
      const resourcesDir = path.join(__dirname, 'resources');
      const htmlDir = path.join(__dirname, 'html');

      // 현재 파일 기준 상대경로 계산 (Windows 경로 → 슬래시 통일)
      const relToResources = path.relative(fromDir, resourcesDir).replace(/\\/g, '/');
      const relToHtmlRoot = path.relative(fromDir, htmlDir).replace(/\\/g, '/');

      // 변환 로직
      let transformed = html
        // 1) <link>/<script>/<img> 등 src|href|content="/resources/..."
        .replace(/(src|href|content)=["']\/resources\/([^"']+)["']/g, (_, attr, rest) => `${attr}="${relToResources}/${rest}"`)
        // 2) 내부 페이지 링크 src|href|content="/html/..."
        .replace(/(src|href|content)=["']\/html\/([^"']+)["']/g, (_, attr, rest) => `${attr}="${relToHtmlRoot}/${rest}"`)
        // 3) style, CSS 내 url('/resources/...')
        .replace(/url\(["']?\/resources\/([^"')]+)["']?\)/g, (_, rest) => `url(${relToResources}/${rest})`);

      file.contents = Buffer.from(transformed);
    }
    cb(null, file);
  });
}

// === HTML 컴파일 (file:// 직접열기용: 절대→상대 치환) ===
function html_compile_file() {
  return gulp
    .src(paths.html.src)
    .pipe(
      fileinclude({
        prefix: '@@',
        basepath: path.join(__dirname, 'includes'),
      })
    )
    .pipe(toFileProtocolPaths()) // ★ 핵심: 상대경로로 변환
    .pipe(
      pretty({
        indent_size: 2,
        indent_char: ' ',
        end_with_newlines: true,
      })
    )
    .pipe(gulp.dest(paths.html.dest));
}

// === 개발 및 빌드 명령 등록 ===
var dev = gulp.series(html_compile_dev, css_compile_dev, serve, watch);
var project_build = gulp.series(html_clean, css_clean, html_compile_file, css_compile_build);

// === export ===
exports.dev = dev;
exports.build = project_build;
