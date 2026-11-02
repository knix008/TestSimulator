// Files under assets/ are imported through Vite, which turns them into URLs.
declare module "*.png" {
  const url: string;
  export default url;
}
