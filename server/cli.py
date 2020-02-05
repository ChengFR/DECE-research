import argparse
from .app import add_arguments_server, start_server


def get_run_args():
    parser = argparse.ArgumentParser()
    add_arguments_server(parser)

    return parser.parse_args()


def main():
    start_server(get_run_args())


if __name__ == '__main__':
    main()
